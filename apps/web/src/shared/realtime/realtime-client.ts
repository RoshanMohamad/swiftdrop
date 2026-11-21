import { io } from "socket.io-client";
import {
  privateRealtimeUpdateSchema,
  publicRealtimeUpdateSchema,
  realtimeJoinResultSchema,
  realtimeReloadSchema,
  type PrivateRealtimeUpdate,
  type PublicRealtimeUpdate,
  type RealtimeJoin,
  type RealtimeLeave,
} from "@swiftdrop/contracts";
import { realtimeAccessToken } from "../../features/auth/client.js";

export type RealtimeConnectionState =
  "connecting" | "connected" | "reconnecting" | "error" | "offline";

type EventListener = (...args: unknown[]) => void;

export interface RealtimeSocketTransport {
  connected: boolean;
  active?: boolean;
  auth: Record<string, unknown>;
  io: {
    on(event: string, listener: EventListener): void;
    off(event: string, listener: EventListener): void;
  };
  on(event: string, listener: EventListener): void;
  off(event: string, listener: EventListener): void;
  emit(event: string, ...args: unknown[]): void;
  connect(): void;
  disconnect(): void;
}

type RealtimeSocketFactory = () => RealtimeSocketTransport;

type Subscription = {
  id: number;
  request: RealtimeJoin;
  onUpdate(update: PublicRealtimeUpdate | PrivateRealtimeUpdate): void;
  onSnapshot(): void | Promise<void>;
  onState(state: RealtimeConnectionState): void;
  lastSequence: number;
  snapshotSequence?: number;
};

const defaultSocketFactory: RealtimeSocketFactory = () =>
  io(window.location.origin, {
    path: "/socket.io",
    transports: ["polling", "websocket"],
    autoConnect: false,
  }) as unknown as RealtimeSocketTransport;

let socketFactory = defaultSocketFactory;
let socket: RealtimeSocketTransport | undefined;
let nextSubscriptionId = 1;
let hasConnected = false;
let closing = false;
let connectTask: Promise<void> | undefined;
const subscriptions = new Map<number, Subscription>();

function roomKey(request: RealtimeJoin | RealtimeLeave) {
  return request.kind === "public"
    ? `public:${request.trackingNumber}`
    : `private:${request.parcelId}`;
}

function leaveRequest(request: RealtimeJoin): RealtimeLeave {
  return request.kind === "public"
    ? { kind: "public", trackingNumber: request.trackingNumber }
    : { kind: "private", parcelId: request.parcelId };
}

function updateState(state: RealtimeConnectionState) {
  for (const subscription of subscriptions.values())
    subscription.onState(state);
}

function snapshot(subscription: Subscription, sequence?: number) {
  if (sequence !== undefined) {
    if (subscription.snapshotSequence === sequence) return;
    subscription.snapshotSequence = sequence;
  }
  void Promise.resolve(subscription.onSnapshot()).catch(() => undefined);
}

function matchingSubscriptions(request: RealtimeJoin) {
  const key = roomKey(request);
  return [...subscriptions.values()].filter(
    (subscription) => roomKey(subscription.request) === key,
  );
}

function join(request: RealtimeJoin, afterReconnect: boolean) {
  const members = matchingSubscriptions(request);
  const lastSequence = Math.max(
    0,
    ...members.map((member) => member.lastSequence),
  );
  const payload = { ...request, lastSequence };
  socket?.emit("room:join", payload, (raw: unknown) => {
    const result = realtimeJoinResultSchema.safeParse(raw);
    const state: RealtimeConnectionState =
      result.success && result.data.ok ? "connected" : "error";
    for (const member of members) {
      member.onState(state);
      if (state === "connected" && afterReconnect) snapshot(member);
    }
  });
}

function joinAll(afterReconnect: boolean) {
  const joined = new Set<string>();
  for (const subscription of subscriptions.values()) {
    const key = roomKey(subscription.request);
    if (joined.has(key)) continue;
    joined.add(key);
    join(subscription.request, afterReconnect);
  }
}

const onConnect: EventListener = () => {
  const reconnected = hasConnected;
  hasConnected = true;
  joinAll(reconnected);
};

const onDisconnect: EventListener = () => {
  if (closing || subscriptions.size === 0) return;
  updateState(navigator.onLine ? "reconnecting" : "offline");
};

const onConnectError: EventListener = () => {
  updateState(navigator.onLine ? "error" : "offline");
};

const onReconnectAttempt: EventListener = () => {
  updateState(navigator.onLine ? "reconnecting" : "offline");
};

const onStatus: EventListener = (raw) => {
  const privateUpdate = privateRealtimeUpdateSchema.safeParse(raw);
  const publicUpdate = publicRealtimeUpdateSchema.safeParse(raw);
  if (!privateUpdate.success && !publicUpdate.success) return;
  for (const subscription of subscriptions.values()) {
    let update: PublicRealtimeUpdate | PrivateRealtimeUpdate;
    if (subscription.request.kind === "private") {
      if (
        !privateUpdate.success ||
        privateUpdate.data.parcelId !== subscription.request.parcelId
      )
        continue;
      update = privateUpdate.data;
    } else {
      if (!publicUpdate.success) continue;
      update = publicUpdate.data;
    }
    if (update.sequence <= subscription.lastSequence) continue;
    if (
      subscription.lastSequence > 0 &&
      update.sequence > subscription.lastSequence + 1
    )
      snapshot(subscription, update.sequence);
    subscription.lastSequence = update.sequence;
    subscription.onUpdate(update);
  }
};

const onReload: EventListener = (raw) => {
  const reload = realtimeReloadSchema.safeParse(raw);
  if (!reload.success) return;
  for (const subscription of subscriptions.values())
    snapshot(subscription, reload.data.sequence);
};

const onEvicted: EventListener = () => {
  for (const subscription of subscriptions.values()) {
    if (subscription.request.kind !== "private") continue;
    subscription.onState("error");
    snapshot(subscription);
  }
};

function onOffline() {
  updateState("offline");
}

function onOnline() {
  if (subscriptions.size === 0) return;
  updateState(hasConnected ? "reconnecting" : "connecting");
  socket?.connect();
}

function createSocket() {
  if (socket) return socket;
  socket = socketFactory();
  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  socket.on("connect_error", onConnectError);
  socket.on("parcel:status", onStatus);
  socket.on("parcel:reload", onReload);
  socket.on("room:evicted", onEvicted);
  socket.io.on("reconnect_attempt", onReconnectAttempt);
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);
  return socket;
}

async function ensureConnected(request: RealtimeJoin) {
  if (connectTask) await connectTask;
  const transport = createSocket();
  if (!navigator.onLine) {
    updateState("offline");
    return;
  }
  if (request.kind === "private") {
    connectTask = realtimeAccessToken()
      .then((token) => {
        if (!subscriptions.has(requestSubscriptionId(request))) return;
        const tokenChanged = transport.auth["token"] !== token;
        transport.auth = { token };
        if (transport.connected && tokenChanged) {
          updateState("reconnecting");
          transport.disconnect();
          transport.connect();
        } else if (!transport.connected && !transport.active) {
          transport.connect();
        } else if (transport.connected) {
          join(request, false);
        }
      })
      .catch(() => updateState("error"))
      .finally(() => {
        connectTask = undefined;
      });
    await connectTask;
    return;
  }
  if (transport.connected) join(request, false);
  else if (!transport.active) transport.connect();
}

function requestSubscriptionId(request: RealtimeJoin) {
  for (const subscription of subscriptions.values())
    if (roomKey(subscription.request) === roomKey(request))
      return subscription.id;
  return -1;
}

function destroySocket() {
  if (!socket) return;
  closing = true;
  socket.off("connect", onConnect);
  socket.off("disconnect", onDisconnect);
  socket.off("connect_error", onConnectError);
  socket.off("parcel:status", onStatus);
  socket.off("parcel:reload", onReload);
  socket.off("room:evicted", onEvicted);
  socket.io.off("reconnect_attempt", onReconnectAttempt);
  socket.disconnect();
  window.removeEventListener("offline", onOffline);
  window.removeEventListener("online", onOnline);
  socket = undefined;
  hasConnected = false;
  closing = false;
  connectTask = undefined;
}

export function subscribeRealtime(input: {
  request: RealtimeJoin;
  onUpdate(update: PublicRealtimeUpdate | PrivateRealtimeUpdate): void;
  onSnapshot(): void | Promise<void>;
  onState(state: RealtimeConnectionState): void;
}) {
  const subscription: Subscription = {
    ...input,
    id: nextSubscriptionId++,
    lastSequence: 0,
  };
  subscriptions.set(subscription.id, subscription);
  subscription.onState(navigator.onLine ? "connecting" : "offline");
  void ensureConnected(input.request);

  return () => {
    const key = roomKey(subscription.request);
    subscriptions.delete(subscription.id);
    if (
      socket?.connected &&
      ![...subscriptions.values()].some(
        (candidate) => roomKey(candidate.request) === key,
      )
    )
      socket.emit("room:leave", leaveRequest(subscription.request));
    if (subscriptions.size === 0) destroySocket();
  };
}

/** Development/test seam. Reset first so a live transport is never swapped in place. */
export function setRealtimeSocketFactory(factory?: RealtimeSocketFactory) {
  resetRealtimeClient();
  socketFactory = factory ?? defaultSocketFactory;
}

export function resetRealtimeClient() {
  subscriptions.clear();
  destroySocket();
  nextSubscriptionId = 1;
}

export type { PrivateRealtimeUpdate, PublicRealtimeUpdate };
