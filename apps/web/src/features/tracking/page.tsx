import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getTracking } from "../auth/client.js";
import { errorMessage } from "../auth/client.js";
import { isTerminalStatus, type ParcelStatus } from "@swiftdrop/contracts";

const STATUS_LABEL: Record<ParcelStatus, string> = {
  CREATED: "Booked",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED: "Delivery attempted",
  CANCELLED: "Cancelled",
};

export function PublicTrackingPage() {
  const { trackingNumber = "" } = useParams();
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getTracking>
  > | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 15_000;

    const fetchStatus = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await getTracking(trackingNumber);
        if (!stopped) {
          setData(next);
          setError("");
          // Stop polling once parcel reaches a terminal state
          if (isTerminalStatus(next.status as ParcelStatus)) return;
        }
      } catch (reason) {
        if (!stopped) setError(errorMessage(reason));
      }
      if (!stopped) {
        timer = setTimeout(fetchStatus, delay);
        delay = Math.min(delay * 2, 60_000);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void fetchStatus();
      } else {
        clearTimeout(timer);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    void fetchStatus();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [trackingNumber, retry]);

  return (
    <section className="auth-panel">
      <span className="eyebrow">SwiftDrop tracking</span>
      <h1>{trackingNumber || "Track a parcel"}</h1>

      {!data && !error && (
        <p role="status">Looking up your delivery…</p>
      )}

      {error && (
        <div role="alert" className="notice error">
          {error}
          <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
        </div>
      )}

      {data && (
        <>
          <p>
            {data.originTown} → {data.destinationTown}
          </p>
          <div className="notice">
            <strong>{STATUS_LABEL[data.status as ParcelStatus] ?? data.status}</strong>
            {isTerminalStatus(data.status as ParcelStatus) && (
              <span> · No further updates</span>
            )}
          </div>
          <h2>Updates</h2>
          <ol className="history-list">
            {data.history.map((item, index) => (
              <li key={`${item.createdAt}-${index}`}>
                <strong>
                  {STATUS_LABEL[item.status as ParcelStatus] ?? item.status}
                </strong>
                <span>
                  {item.town} · {new Date(item.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
