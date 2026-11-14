import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  privateRealtimeUpdateSchema,
  publicRealtimeUpdateSchema,
  realtimeReloadSchema,
  type PrivateRealtimeUpdate,
  type PublicRealtimeUpdate,
} from "@swiftdrop/contracts";
import { realtimeAccessToken } from "../../features/auth/client.js";

export type RealtimeState = "connecting" | "live" | "fallback" | "evicted";

type PublicOptions = {
  kind: "public";
  trackingNumber: string;
  onUpdate(update: PublicRealtimeUpdate): void;
  onSnapshot(): void | Promise<void>;
};
type PrivateOptions = {
  kind: "private";
  parcelId: string;
  onUpdate(update: PrivateRealtimeUpdate): void;
  onSnapshot(): void | Promise<void>;
};

export function useParcelRealtime(options: PublicOptions | PrivateOptions) {
  const [state, setState] = useState<RealtimeState>("connecting");
  const updateRef = useRef<
    (update: PublicRealtimeUpdate | PrivateRealtimeUpdate) => void
  >(
    options.onUpdate as (
      update: PublicRealtimeUpdate | PrivateRealtimeUpdate,
    ) => void,
  );
  const snapshotRef = useRef(options.onSnapshot);
  const lastSequence = useRef(0);
  const snapshotSequence = useRef<number>();
  updateRef.current = options.onUpdate as (
    update: PublicRealtimeUpdate | PrivateRealtimeUpdate,
  ) => void;
  snapshotRef.current = options.onSnapshot;
  const roomId =
    options.kind === "public" ? options.trackingNumber : options.parcelId;

  useEffect(() => {
    let stopped = false;
    let socket: Socket | undefined;
    void (async () => {
      try {
        const token =
          options.kind === "private" ? await realtimeAccessToken() : undefined;
        if (stopped) return;
        socket = io(window.location.origin, {
          path: "/socket.io",
          transports: ["polling", "websocket"],
          auth: token ? { token } : {},
        });
        socket.on("connect", () => {
          snapshotSequence.current = undefined;
          const room =
            options.kind === "public"
              ? {
                  kind: "public",
                  trackingNumber: roomId,
                  lastSequence: lastSequence.current,
                }
              : {
                  kind: "private",
                  parcelId: roomId,
                  lastSequence: lastSequence.current,
                };
          socket?.emit(
            "room:join",
            room,
            (result: { ok: boolean; code?: string }) =>
              setState(result.ok ? "live" : "fallback"),
          );
        });
        socket.on("parcel:status", (raw: unknown) => {
          const parsed =
            options.kind === "public"
              ? publicRealtimeUpdateSchema.safeParse(raw)
              : privateRealtimeUpdateSchema.safeParse(raw);
          if (!parsed.success || parsed.data.sequence <= lastSequence.current)
            return;
          if (
            lastSequence.current > 0 &&
            parsed.data.sequence > lastSequence.current + 1
          ) {
            snapshotSequence.current = parsed.data.sequence;
            void snapshotRef.current();
          }
          lastSequence.current = parsed.data.sequence;
          updateRef.current(parsed.data);
        });
        socket.on("parcel:reload", (raw: unknown) => {
          const reload = realtimeReloadSchema.safeParse(raw);
          if (
            !reload.success ||
            snapshotSequence.current === reload.data.sequence
          )
            return;
          snapshotSequence.current = reload.data.sequence;
          void snapshotRef.current();
        });
        socket.on("room:evicted", () => {
          setState("evicted");
          void snapshotRef.current();
          socket?.disconnect();
        });
        socket.on("connect_error", () => setState("fallback"));
      } catch {
        if (!stopped) setState("fallback");
      }
    })();
    return () => {
      stopped = true;
      socket?.disconnect();
    };
  }, [options.kind, roomId]);

  return state;
}
