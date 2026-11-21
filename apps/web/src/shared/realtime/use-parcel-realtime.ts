import { useEffect, useRef, useState } from "react";
import type {
  PrivateRealtimeUpdate,
  PublicRealtimeUpdate,
} from "@swiftdrop/contracts";
import {
  subscribeRealtime,
  type RealtimeConnectionState,
} from "./realtime-client.js";

export type RealtimeOptions<TUpdate> = {
  onUpdate(update: TUpdate): void;
  onSnapshot(): void | Promise<void>;
};

function useRealtimeSubscription<TUpdate>(
  request:
    | { kind: "public"; trackingNumber: string }
    | { kind: "private"; parcelId: string },
  options: RealtimeOptions<TUpdate>,
) {
  const [state, setState] = useState<RealtimeConnectionState>(
    navigator.onLine ? "connecting" : "offline",
  );
  const updateRef = useRef(options.onUpdate);
  const snapshotRef = useRef(options.onSnapshot);
  updateRef.current = options.onUpdate;
  snapshotRef.current = options.onSnapshot;
  const roomId =
    request.kind === "public" ? request.trackingNumber : request.parcelId;

  useEffect(
    () =>
      subscribeRealtime({
        request,
        onState: setState,
        onSnapshot: () => snapshotRef.current(),
        onUpdate: (update) => updateRef.current(update as TUpdate),
      }),
    [request.kind, roomId],
  );

  return state;
}

export function usePublicParcelRealtime(
  trackingNo: string,
  options: RealtimeOptions<PublicRealtimeUpdate>,
) {
  return useRealtimeSubscription(
    { kind: "public", trackingNumber: trackingNo },
    options,
  );
}

export function usePrivateParcelRealtime(
  parcelId: string,
  options: RealtimeOptions<PrivateRealtimeUpdate>,
) {
  return useRealtimeSubscription({ kind: "private", parcelId }, options);
}

/** Compatibility wrapper for existing consumers; prefer the named hooks above. */
export function useParcelRealtime(
  options:
    | ({
        kind: "public";
        trackingNumber: string;
      } & RealtimeOptions<PublicRealtimeUpdate>)
    | ({
        kind: "private";
        parcelId: string;
      } & RealtimeOptions<PrivateRealtimeUpdate>),
) {
  const request =
    options.kind === "public"
      ? { kind: "public" as const, trackingNumber: options.trackingNumber }
      : { kind: "private" as const, parcelId: options.parcelId };
  return useRealtimeSubscription(request, options);
}

export type RealtimeState = RealtimeConnectionState;
