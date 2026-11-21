import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { realtimeAccessToken } from "../../features/auth/client.js";
import { createMockRealtimeEmitter } from "./mock-realtime.js";
import {
  resetRealtimeClient,
  setRealtimeSocketFactory,
} from "./realtime-client.js";
import {
  usePrivateParcelRealtime,
  usePublicParcelRealtime,
} from "./use-parcel-realtime.js";

vi.mock("../../features/auth/client.js", () => ({
  realtimeAccessToken: vi.fn(async () => "private-token"),
}));

let mock = createMockRealtimeEmitter({ autoConnect: false });
let factory = vi.fn(() => mock.transport);

beforeEach(() => {
  mock = createMockRealtimeEmitter({ autoConnect: false });
  factory = vi.fn(() => mock.transport);
  setRealtimeSocketFactory(factory);
  vi.mocked(realtimeAccessToken).mockResolvedValue("private-token");
});

afterEach(() => {
  resetRealtimeClient();
  vi.restoreAllMocks();
});

describe("parcel realtime hooks", () => {
  it("shares one managed socket, joins once and leaves after the final cleanup", async () => {
    const options = { onUpdate: vi.fn(), onSnapshot: vi.fn() };
    const first = renderHook(() =>
      usePublicParcelRealtime("SD00000000", options),
    );
    const second = renderHook(() =>
      usePublicParcelRealtime("SD00000000", options),
    );
    expect(first.result.current).toBe("connecting");
    expect(factory).toHaveBeenCalledTimes(1);

    act(() => mock.connect());
    await waitFor(() => expect(first.result.current).toBe("connected"));
    expect(second.result.current).toBe("connected");
    expect(
      mock.emitted.filter(({ event }) => event === "room:join"),
    ).toHaveLength(1);

    first.unmount();
    expect(
      mock.emitted.filter(({ event }) => event === "room:leave"),
    ).toHaveLength(0);
    second.unmount();
    expect(
      mock.emitted.filter(({ event }) => event === "room:leave"),
    ).toHaveLength(1);
    expect(mock.listenerCount("parcel:status")).toBe(0);
  });

  it("deduplicates, ignores stale/unsafe public frames and refetches on gaps", async () => {
    const onUpdate = vi.fn();
    const onSnapshot = vi.fn();
    renderHook(() =>
      usePublicParcelRealtime("SD00000000", { onUpdate, onSnapshot }),
    );
    act(() => mock.connect());
    const first = {
      status: "PICKED_UP" as const,
      occurredAt: "2026-11-15T10:31:00.000Z",
      town: "Colombo",
      sequence: 1,
    };
    act(() => {
      mock.serverEmit("parcel:status", first);
      mock.serverEmit("parcel:status", first);
      mock.serverEmit("parcel:status", { ...first, sequence: 0 });
      mock.serverEmitRaw("parcel:status", {
        ...first,
        parcelId: "22222222-2222-4222-8222-222222222222",
      });
      mock.serverEmit("parcel:status", {
        ...first,
        status: "IN_TRANSIT",
        sequence: 3,
      });
    });
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0]![0]).toEqual(first);
  });

  it("enters reconnecting state and refetches after reconnect", async () => {
    const onSnapshot = vi.fn();
    const hook = renderHook(() =>
      usePublicParcelRealtime("SD00000000", {
        onUpdate: vi.fn(),
        onSnapshot,
      }),
    );
    act(() => mock.connect());
    await waitFor(() => expect(hook.result.current).toBe("connected"));
    act(() => mock.transport.disconnect());
    expect(hook.result.current).toBe("reconnecting");
    act(() => mock.connect());
    await waitFor(() => expect(hook.result.current).toBe("connected"));
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("uses the in-memory auth transport and refetches after expiry eviction", async () => {
    const onSnapshot = vi.fn();
    const hook = renderHook(() =>
      usePrivateParcelRealtime("22222222-2222-4222-8222-222222222222", {
        onUpdate: vi.fn(),
        onSnapshot,
      }),
    );
    await waitFor(() => expect(realtimeAccessToken).toHaveBeenCalledTimes(1));
    expect(mock.transport.auth).toEqual({ token: "private-token" });
    act(() => mock.connect());
    await waitFor(() => expect(hook.result.current).toBe("connected"));
    act(() => mock.serverEmit("room:evicted", { reason: "expired" }));
    expect(hook.result.current).toBe("error");
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(localStorage).toHaveLength(0);
  });

  it("exposes connection error and offline states", async () => {
    const hook = renderHook(() =>
      usePublicParcelRealtime("SD00000000", {
        onUpdate: vi.fn(),
        onSnapshot: vi.fn(),
      }),
    );
    expect(hook.result.current).toBe("connecting");
    act(() => mock.fail());
    expect(hook.result.current).toBe("error");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(hook.result.current).toBe("offline");
  });

  it("does not deliver a private projection to the public hook", () => {
    const onUpdate = vi.fn();
    renderHook(() =>
      usePublicParcelRealtime("SD00000000", {
        onUpdate,
        onSnapshot: vi.fn(),
      }),
    );
    act(() => mock.connect());
    act(() =>
      mock.serverEmit("parcel:status", {
        status: "DELIVERED",
        occurredAt: "2026-11-15T10:31:00.000Z",
        town: "Kandy",
        sequence: 4,
        parcelId: "22222222-2222-4222-8222-222222222222",
        trackingNumber: "SD00000000",
      }),
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
