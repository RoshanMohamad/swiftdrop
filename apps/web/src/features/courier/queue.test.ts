import { describe, expect, it, vi } from "vitest";
import type { CourierStatusUpdate } from "@swiftdrop/contracts";
import { ApiError } from "../auth/client.js";
import {
  createMemoryStore,
  expectedVersion,
  replayQueue,
  type QueuedOperation,
  type ReplayApi,
} from "./queue.js";

const PARCEL_A = "11111111-1111-4111-8111-111111111111";
const PARCEL_B = "22222222-2222-4222-8222-222222222222";

function op(
  key: string,
  parcelId: string,
  createdAt: number,
  body: Partial<CourierStatusUpdate> = {},
  extra: Partial<QueuedOperation> = {},
): QueuedOperation {
  return {
    key,
    userId: 7,
    parcelId,
    createdAt,
    state: "pending",
    body: {
      to: "PICKED_UP",
      town: "Colombo",
      version: 2,
      ...body,
    } as CourierStatusUpdate,
    ...extra,
  };
}
const problem = (status: number, detail = "nope") =>
  new ApiError({
    type: "about:blank",
    title: "x",
    status,
    detail,
    code: "X",
    correlationId: "",
  });

function api(overrides: Partial<ReplayApi> = {}): ReplayApi {
  return {
    uploadProof: vi.fn(async () => `proofs/${PARCEL_A}/${"a".repeat(36)}.jpg`),
    update: vi.fn(async () => ({})),
    ...overrides,
  };
}

describe("expectedVersion", () => {
  it("adds the queued updates for the parcel to the server version", () => {
    const queue = [
      op("k1", PARCEL_A, 1),
      op("k2", PARCEL_A, 2),
      op("k3", PARCEL_B, 3),
    ];
    expect(expectedVersion(2, PARCEL_A, queue)).toBe(4);
    expect(expectedVersion(5, PARCEL_B, queue)).toBe(6);
    expect(
      expectedVersion(5, PARCEL_B, [
        op("k", PARCEL_B, 1, {}, { state: "review" }),
      ]),
    ).toBe(5);
  });
});

describe("replayQueue (FR-K3)", () => {
  it("sends in creation order with the original operation keys and removes sent items", async () => {
    const store = createMemoryStore();
    await store.put(
      op("second-key", PARCEL_A, 20, { to: "IN_TRANSIT", version: 3 }),
    );
    await store.put(op("first-key", PARCEL_A, 10));
    const sent: string[] = [];
    const result = await replayQueue(
      store,
      7,
      api({ update: vi.fn(async (_id, key) => void sent.push(key)) }),
    );
    expect(sent).toEqual(["first-key", "second-key"]);
    expect(result).toMatchObject({
      sent: 2,
      review: 0,
      waiting: 0,
      stopped: null,
    });
    expect(await store.list()).toHaveLength(0);
  });

  it("uploads a saved photo first and sends the returned proof key", async () => {
    const store = createMemoryStore();
    await store.put(
      op(
        "deliver-key",
        PARCEL_A,
        1,
        { to: "DELIVERED", version: 5, receivedBy: "Nimal" },
        { photo: new Blob(["x"], { type: "image/jpeg" }) },
      ),
    );
    const client = api();
    await replayQueue(store, 7, client);
    expect(client.uploadProof).toHaveBeenCalledTimes(1);
    expect(client.update).toHaveBeenCalledWith(
      PARCEL_A,
      "deliver-key",
      expect.objectContaining({
        proofObjectKey: expect.stringContaining("proofs/"),
      }),
    );
  });

  it("pauses a parcel for review on 409 and never overwrites, while other parcels continue", async () => {
    const store = createMemoryStore();
    await store.put(op("a1", PARCEL_A, 1));
    await store.put(op("a2", PARCEL_A, 2, { to: "IN_TRANSIT", version: 3 }));
    await store.put(op("b1", PARCEL_B, 3));
    const update = vi.fn(async (id: string) => {
      if (id === PARCEL_A)
        throw problem(409, "This parcel was modified by someone else.");
      return {};
    });
    const result = await replayQueue(store, 7, api({ update }));
    expect(result).toMatchObject({ sent: 1, review: 1, waiting: 1 });
    expect(update).toHaveBeenCalledTimes(2); // a1 (rejected) and b1; a2 is held back
    const left = await store.list();
    expect(left.find((item) => item.key === "a1")).toMatchObject({
      state: "review",
      problem: "This parcel was modified by someone else.",
    });
    expect(left.find((item) => item.key === "a2")?.state).toBe("pending");
    // A later run does not retry the paused parcel.
    await replayQueue(store, 7, api({ update }));
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("stops and keeps everything on a network failure", async () => {
    const store = createMemoryStore();
    await store.put(op("k1", PARCEL_A, 1));
    await store.put(op("k2", PARCEL_B, 2));
    const update = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const result = await replayQueue(store, 7, api({ update }));
    expect(result).toMatchObject({ sent: 0, stopped: "offline", waiting: 2 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(await store.list()).toHaveLength(2);
  });

  it("stops on 401 and on server errors without discarding", async () => {
    for (const [status, stopped] of [
      [401, "auth"],
      [503, "server"],
    ] as const) {
      const store = createMemoryStore();
      await store.put(op("k1", PARCEL_A, 1));
      const result = await replayQueue(
        store,
        7,
        api({
          update: vi.fn(async () => {
            throw problem(status);
          }),
        }),
      );
      expect(result.stopped).toBe(stopped);
      expect(await store.list()).toHaveLength(1);
    }
  });

  it("only replays operations for the original user", async () => {
    const store = createMemoryStore();
    await store.put(op("mine", PARCEL_A, 1));
    await store.put(op("theirs", PARCEL_B, 2, {}, { userId: 99 }));
    const client = api();
    const result = await replayQueue(store, 7, client);
    expect(client.update).toHaveBeenCalledTimes(1);
    expect(result.otherUser).toBe(1);
    expect((await store.list()).map((item) => item.key)).toEqual(["theirs"]);
  });
});
