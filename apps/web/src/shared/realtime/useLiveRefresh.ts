import { useParcelRealtime } from "./use-parcel-realtime.js";

/** Existing screens refetch their authorised REST snapshot after updates and reconnects. */
export function useLiveRefresh(options: {
  trackingNumber?: string;
  parcelId?: string;
  onChange: () => void;
}) {
  const state = useParcelRealtime({
    ...(options.parcelId
      ? { kind: "private" as const, parcelId: options.parcelId }
      : {
          kind: "public" as const,
          trackingNumber: options.trackingNumber ?? "",
        }),
    onUpdate: options.onChange,
    onSnapshot: options.onChange,
  });
  return { connected: state === "connected" };
}
