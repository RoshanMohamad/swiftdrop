import type {
  RealtimeClientToServerEvents,
  RealtimeServerToClientEvents,
} from "@swiftdrop/contracts";
import type { RealtimeSocketTransport } from "./realtime-client.js";

type Listener = (...args: unknown[]) => void;

/** In-memory Socket.IO-shaped emitter for mock mode, Storybook-style demos and tests. */
export function createMockRealtimeEmitter(
  options: { autoConnect?: boolean } = {},
) {
  const listeners = new Map<string, Set<Listener>>();
  const managerListeners = new Map<string, Set<Listener>>();
  const joinedRooms: unknown[] = [];
  const emitted: Array<{ event: string; args: unknown[] }> = [];
  const add = (
    map: Map<string, Set<Listener>>,
    event: string,
    listener: Listener,
  ) => {
    const group = map.get(event) ?? new Set<Listener>();
    group.add(listener);
    map.set(event, group);
  };
  const remove = (
    map: Map<string, Set<Listener>>,
    event: string,
    listener: Listener,
  ) => map.get(event)?.delete(listener);
  const dispatch = (
    map: Map<string, Set<Listener>>,
    event: string,
    ...args: unknown[]
  ) => {
    for (const listener of map.get(event) ?? []) listener(...args);
  };

  const transport: RealtimeSocketTransport = {
    connected: false,
    active: false,
    auth: {},
    io: {
      on: (event, listener) => add(managerListeners, event, listener),
      off: (event, listener) => remove(managerListeners, event, listener),
    },
    on: (event, listener) => add(listeners, event, listener),
    off: (event, listener) => remove(listeners, event, listener),
    emit: (event, ...args) => {
      emitted.push({ event, args });
      if (event === "room:join") {
        joinedRooms.push(args[0]);
        const acknowledge = args[1];
        if (typeof acknowledge === "function") acknowledge({ ok: true });
      }
      if (event === "room:leave") {
        const leave = args[0] as
          | { kind: "public"; trackingNumber: string }
          | { kind: "private"; parcelId: string };
        const index = joinedRooms.findIndex((room) => {
          const joined = room as typeof leave;
          return joined.kind === leave.kind &&
            joined.kind === "public" &&
            leave.kind === "public"
            ? joined.trackingNumber === leave.trackingNumber
            : joined.kind === "private" && leave.kind === "private"
              ? joined.parcelId === leave.parcelId
              : false;
        });
        if (index >= 0) joinedRooms.splice(index, 1);
      }
    },
    connect: () => {
      transport.active = true;
      if (options.autoConnect !== false) api.connect();
    },
    disconnect: () => {
      const wasConnected = transport.connected;
      transport.connected = false;
      transport.active = false;
      if (wasConnected)
        dispatch(listeners, "disconnect", "io client disconnect");
    },
  };

  const api = {
    transport,
    joinedRooms,
    emitted,
    connect() {
      transport.connected = true;
      transport.active = true;
      dispatch(listeners, "connect");
    },
    reconnect() {
      dispatch(managerListeners, "reconnect_attempt", 1);
      transport.connected = false;
      dispatch(listeners, "disconnect", "transport close");
      api.connect();
    },
    fail() {
      dispatch(listeners, "connect_error", new Error("Mock connection failed"));
    },
    serverEmit<Event extends keyof RealtimeServerToClientEvents>(
      event: Event,
      payload: Parameters<RealtimeServerToClientEvents[Event]>[0],
    ) {
      dispatch(listeners, event, payload);
    },
    serverEmitRaw(event: string, payload: unknown) {
      dispatch(listeners, event, payload);
    },
    clientEventNames: [] as Array<keyof RealtimeClientToServerEvents>,
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
  };
  return api;
}
