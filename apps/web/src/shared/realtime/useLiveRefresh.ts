import { useEffect, useRef, useState } from "react";
import { REALTIME_EVENTS } from "@swiftdrop/contracts";
import { bearer } from "../../features/auth/client.js";

type Ack = { ok: boolean; error?: string };

/**
 * Live updates for one parcel (FR-I6, X-12). The socket only says "something newer happened":
 * `onChange` refetches through the normal authorised REST endpoint, so the screen never trusts
 * a pushed payload for anything beyond ordering. Polling and the REST snapshot stay as the
 * fallback, so a blocked or failing socket degrades to the previous behaviour.
 *
 * - `trackingNumber`: public room, no login (public tracking page).
 * - `parcelId`: private room, bearer token re-read on every (re)connect.
 */
export function useLiveRefresh(options: {
  trackingNumber?: string;
  parcelId?: string;
  onChange: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const onChange = useRef(options.onChange);
  onChange.current = options.onChange;
  const { trackingNumber, parcelId } = options;

  useEffect(() => {
    // Tests and the MSW mock mode have no socket server.
    if (
      import.meta.env.MODE === "test" ||
      import.meta.env.MODE === "mock" ||
      (!trackingNumber && !parcelId)
    )
      return;
    let closed = false;
    let cleanup: (() => void) | undefined;
    void import("socket.io-client").then(({ io }) => {
      if (closed) return;
      const lastSequence = { value: 0 };
      const socket = io({
        path: "/socket.io",
        transports: ["websocket", "polling"],
        // A function, so a reconnect after token expiry sends a fresh token.
        auth: parcelId
          ? (done: (data: object) => void) => {
              void bearer()
                .then((session) => done({ token: session.accessToken }))
                .catch(() => done({}));
            }
          : undefined,
      });
      const join = () =>
        socket.emit(
          parcelId ? REALTIME_EVENTS.parcelJoin : REALTIME_EVENTS.trackJoin,
          parcelId ? { parcelId } : { trackingNumber },
          (response: Ack) => {
            setConnected(Boolean(response?.ok));
            // Joining returns an authorised snapshot: refetch to close any gap.
            if (response?.ok) onChange.current();
          },
        );
      socket.on("connect", join);
      socket.on("disconnect", () => setConnected(false));
      socket.on(REALTIME_EVENTS.status, (event: { sequence?: number }) => {
        if (typeof event?.sequence !== "number") return;
        if (event.sequence <= lastSequence.value) return; // duplicate or out of order
        lastSequence.value = event.sequence;
        onChange.current();
      });
      socket.on(REALTIME_EVENTS.authExpired, () => socket.connect());
      cleanup = () => {
        socket.off();
        socket.close();
      };
    });
    return () => {
      closed = true;
      cleanup?.();
      setConnected(false);
    };
  }, [trackingNumber, parcelId]);

  return { connected };
}
