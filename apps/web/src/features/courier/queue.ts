import type { CourierStatusUpdate } from "@swiftdrop/contracts";
import { ApiError } from "../auth/client.js";

/**
 * Offline queue for courier status updates (FR-K3). Each entry keeps the stable operation key,
 * the expected parcel version and the original user. Replay is per parcel and in order, runs
 * only for the signed-in original user, uploads a saved photo first, and pauses a parcel for
 * review on 404/409 instead of overwriting newer server state.
 */
export interface QueuedOperation {
  key: string;
  userId: number;
  parcelId: string;
  body: CourierStatusUpdate;
  photo?: Blob;
  createdAt: number;
  state: "pending" | "review";
  problem?: string;
}

export interface QueueStore {
  list(): Promise<QueuedOperation[]>;
  put(operation: QueuedOperation): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createMemoryStore(): QueueStore {
  const items = new Map<string, QueuedOperation>();
  return {
    list: async () => [...items.values()],
    put: async (operation) => void items.set(operation.key, operation),
    remove: async (key) => void items.delete(key),
  };
}

const DB = "swiftdrop-courier";
const STORE = "operations";

/** IndexedDB-backed store (keeps photo blobs); falls back to memory when unavailable. */
export function createIdbStore(): QueueStore {
  if (typeof indexedDB === "undefined") return createMemoryStore();
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore(STORE, { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const run = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    list: () => run("readonly", (store) => store.getAll()),
    put: async (operation) =>
      void (await run("readwrite", (s) => s.put(operation))),
    remove: async (key) => void (await run("readwrite", (s) => s.delete(key))),
  };
}

export function newOperationKey() {
  return crypto.randomUUID().replaceAll("-", "");
}

/** The version the next update must expect: server version plus updates still waiting to send. */
export function expectedVersion(
  serverVersion: number,
  parcelId: string,
  queue: QueuedOperation[],
) {
  return (
    serverVersion +
    queue.filter(
      (item) => item.parcelId === parcelId && item.state === "pending",
    ).length
  );
}

export interface ReplayApi {
  uploadProof(parcelId: string, photo: Blob): Promise<string>;
  update(
    parcelId: string,
    key: string,
    body: CourierStatusUpdate,
  ): Promise<unknown>;
}

export interface ReplayResult {
  sent: number;
  review: number;
  waiting: number;
  otherUser: number;
  stopped: null | "offline" | "auth" | "server";
}

const REVIEW_STATUSES = new Set([400, 404, 409, 413, 415]);

export async function replayQueue(
  store: QueueStore,
  userId: number,
  api: ReplayApi,
): Promise<ReplayResult> {
  const all = (await store.list()).sort((a, b) => a.createdAt - b.createdAt);
  const result: ReplayResult = {
    sent: 0,
    review: 0,
    waiting: 0,
    otherUser: 0,
    stopped: null,
  };
  const blocked = new Set<string>();
  for (const item of all) {
    if (item.userId !== userId) {
      result.otherUser += 1;
      continue;
    }
    if (item.state === "review") {
      blocked.add(item.parcelId);
      result.review += 1;
      continue;
    }
    if (result.stopped || blocked.has(item.parcelId)) {
      result.waiting += 1;
      continue;
    }
    try {
      let body = item.body;
      if (item.photo && !body.proofObjectKey) {
        const proofObjectKey = await api.uploadProof(item.parcelId, item.photo);
        body = { ...body, proofObjectKey };
        await store.put({ ...item, body });
      }
      await api.update(item.parcelId, item.key, body);
      await store.remove(item.key);
      result.sent += 1;
    } catch (error) {
      if (error instanceof ApiError) {
        const status = error.problem.status;
        if (REVIEW_STATUSES.has(status)) {
          await store.put({
            ...item,
            state: "review",
            problem: error.problem.detail,
          });
          blocked.add(item.parcelId);
          result.review += 1;
          continue;
        }
        result.stopped = status === 401 || status === 403 ? "auth" : "server";
      } else result.stopped = "offline";
      result.waiting += 1;
    }
  }
  return result;
}
