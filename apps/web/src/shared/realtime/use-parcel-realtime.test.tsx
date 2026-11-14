import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useParcelRealtime } from "./use-parcel-realtime.js";

const socket = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    handlers,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    emit: vi.fn(
      (
        event: string,
        _payload: unknown,
        callback?: (result: { ok: boolean }) => void,
      ) => {
        if (event === "room:join") callback?.({ ok: true });
      },
    ),
    disconnect: vi.fn(),
  };
});

vi.mock("socket.io-client", () => ({ io: () => socket }));
vi.mock("../../features/auth/client.js", () => ({
  realtimeAccessToken: vi.fn(async () => "private-token"),
}));

beforeEach(() => {
  socket.handlers.clear();
  socket.on.mockClear();
  socket.emit.mockClear();
  socket.disconnect.mockClear();
});

describe("useParcelRealtime", () => {
  it("joins a public room, suppresses stale updates and reloads on a gap", async () => {
    const onUpdate = vi.fn();
    const onSnapshot = vi.fn();
    const hook = renderHook(() =>
      useParcelRealtime({
        kind: "public",
        trackingNumber: "SD00000000",
        onUpdate,
        onSnapshot,
      }),
    );
    await waitFor(() => expect(socket.handlers.has("connect")).toBe(true));
    act(() => socket.handlers.get("connect")?.());
    await waitFor(() => expect(hook.result.current).toBe("live"));
    const first = {
      status: "PICKED_UP",
      occurredAt: "2026-11-13T10:31:00.000Z",
      town: "Colombo",
      sequence: 2,
    };
    act(() => socket.handlers.get("parcel:status")?.(first));
    act(() => socket.handlers.get("parcel:status")?.(first));
    act(() =>
      socket.handlers.get("parcel:status")?.({
        ...first,
        status: "IN_TRANSIT",
        sequence: 4,
      }),
    );
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    act(() => socket.handlers.get("connect")?.());
    expect(socket.emit).toHaveBeenLastCalledWith(
      "room:join",
      {
        kind: "public",
        trackingNumber: "SD00000000",
        lastSequence: 4,
      },
      expect.any(Function),
    );
    act(() =>
      socket.handlers
        .get("parcel:reload")?.({ reason: "reconnect", sequence: 4 }),
    );
    expect(onSnapshot).toHaveBeenCalledTimes(2);
  });

  it("uses an access token for private rooms and stops after eviction", async () => {
    const hook = renderHook(() =>
      useParcelRealtime({
        kind: "private",
        parcelId: "22222222-2222-4222-8222-222222222222",
        onUpdate: vi.fn(),
        onSnapshot: vi.fn(),
      }),
    );
    await waitFor(() => expect(socket.handlers.has("connect")).toBe(true));
    act(() => socket.handlers.get("connect")?.());
    act(() => socket.handlers.get("room:evicted")?.({ reason: "expired" }));
    await waitFor(() => expect(hook.result.current).toBe("evicted"));
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
