import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  createParcel,
  createQuote,
  errorMessage,
  getParcel,
  getTracking,
  listParcels,
} from "../auth/client.js";
import {
  bookingRequestSchema,
  quoteRequestSchema,
  type QuoteRequest,
} from "@swiftdrop/contracts";
const money = (cents: number) =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(
    cents / 100,
  );

export function NewParcel() {
  const navigate = useNavigate();
  const [quote, setQuote] = useState<Awaited<
    ReturnType<typeof createQuote>
  > | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [request, setRequest] = useState<QuoteRequest>({
    originDistrict: "Colombo",
    destinationDistrict: "Kandy",
    weightGrams: 2000,
    lengthMm: 250,
    widthMm: 180,
    heightMm: 120,
  });
  const [recipient, setRecipient] = useState({
    recipientName: "",
    recipientPhone: "",
    recipientAddress: "",
  });
  const [key, setKey] = useState("");
  const [attempted, setAttempted] = useState<ReturnType<
    typeof bookingRequestSchema.parse
  > | null>(null);
  async function getQuote(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      setQuote(await createQuote(quoteRequestSchema.parse(request)));
      setKey(crypto.randomUUID());
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  async function confirm(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const input =
        attempted ??
        bookingRequestSchema.parse({ quoteId: quote!.id, ...recipient });
      setAttempted(input);
      const parcel = await createParcel(input, key);
      navigate(`/parcels/${parcel.id}`, { replace: true });
    } catch (reason) {
      if (reason instanceof ApiError && reason.problem.status === 410) {
        setQuote(null);
        setAttempted(null);
      }
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }
  if (quote)
    return (
      <section className="auth-panel">
        <span className="eyebrow">Review your delivery</span>
        <h1>Ready to send?</h1>
        <div className="notice">
          <p>
            {quote.originTown} → {quote.destinationTown}
          </p>
          <p>
            {request.weightGrams / 1000} kg · {request.lengthMm} ×{" "}
            {request.widthMm} × {request.heightMm} mm
          </p>
          <strong>{money(quote.feeCents)}</strong>
          <p>Quote expires {new Date(quote.expiresAt).toLocaleTimeString()}.</p>
        </div>
        <form onSubmit={(event) => void confirm(event)}>
          <label htmlFor="recipientName">Recipient name</label>
          <input
            id="recipientName"
            required
            minLength={2}
            maxLength={120}
            disabled={!!attempted}
            value={recipient.recipientName}
            onChange={(event) =>
              setRecipient({ ...recipient, recipientName: event.target.value })
            }
          />
          <label htmlFor="recipientPhone">Recipient phone</label>
          <input
            id="recipientPhone"
            required
            autoComplete="tel"
            disabled={!!attempted}
            value={recipient.recipientPhone}
            onChange={(event) =>
              setRecipient({ ...recipient, recipientPhone: event.target.value })
            }
          />
          <small>Use a Sri Lankan mobile number.</small>
          <label htmlFor="recipientAddress">Delivery address</label>
          <input
            id="recipientAddress"
            required
            minLength={5}
            maxLength={300}
            autoComplete="street-address"
            disabled={!!attempted}
            value={recipient.recipientAddress}
            onChange={(event) =>
              setRecipient({
                ...recipient,
                recipientAddress: event.target.value,
              })
            }
          />
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <button className="primary" disabled={pending}>
            {pending
              ? "Booking…"
              : attempted
                ? "Retry booking"
                : "Confirm booking"}
          </button>
        </form>
        <button
          className="secondary"
          disabled={pending}
          onClick={() => {
            setQuote(null);
            setKey("");
            setAttempted(null);
          }}
        >
          Change parcel details
        </button>
      </section>
    );
  return (
    <section className="auth-panel">
      <span className="eyebrow">Customer booking</span>
      <h1>Send a parcel.</h1>
      <form onSubmit={(event) => void getQuote(event)}>
        <label htmlFor="originDistrict">Pickup district</label>
        <input
          id="originDistrict"
          required
          value={request.originDistrict}
          onChange={(event) =>
            setRequest({ ...request, originDistrict: event.target.value })
          }
        />
        <label htmlFor="destinationDistrict">Delivery district</label>
        <input
          id="destinationDistrict"
          required
          value={request.destinationDistrict}
          onChange={(event) =>
            setRequest({ ...request, destinationDistrict: event.target.value })
          }
        />
        <label htmlFor="weight">Weight (grams)</label>
        <input
          id="weight"
          type="number"
          min="1"
          max="30000"
          required
          value={request.weightGrams}
          onChange={(event) =>
            setRequest({ ...request, weightGrams: Number(event.target.value) })
          }
        />
        <div className="parcel-dimensions">
          {(["lengthMm", "widthMm", "heightMm"] as const).map((field) => (
            <div key={field}>
              <label htmlFor={field}>{field.replace("Mm", "")} (mm)</label>
              <input
                id={field}
                type="number"
                min="1"
                max="1500"
                required
                value={request[field]}
                onChange={(event) =>
                  setRequest({
                    ...request,
                    [field]: Number(event.target.value),
                  })
                }
              />
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <button className="primary" disabled={pending}>
          {pending ? "Checking price…" : "Get a quote"}
        </button>
      </form>
      <p>
        <Link to="/parcels">View your bookings</Link>
      </p>
    </section>
  );
}

export function ParcelList() {
  const [page, setPage] = useState<Awaited<
    ReturnType<typeof listParcels>
  > | null>(null);
  const [cursor, setCursor] = useState<string>();
  const [error, setError] = useState("");
  const load = useCallback(async (next?: string) => {
    try {
      setPage(await listParcels(next));
      setCursor(next);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="auth-panel">
      <span className="eyebrow">Your deliveries</span>
      <h1>Booking history</h1>
      <Link className="primary parcel-action" to="/parcels/new">
        Book a delivery
      </Link>
      {error && <p role="alert">{error}</p>}
      {!page && !error ? (
        <p role="status">Loading your bookings…</p>
      ) : page?.items.length === 0 ? (
        <div className="notice">
          No bookings yet. Your deliveries will appear here.
        </div>
      ) : (
        <ul className="parcel-list">
          {page?.items.map((parcel) => (
            <li key={parcel.id}>
              <Link to={`/parcels/${parcel.id}`}>
                <strong>{parcel.trackingNumber}</strong>
                <span>
                  {parcel.originTown} → {parcel.destinationTown}
                </span>
                <span>
                  {new Date(parcel.createdAt).toLocaleDateString()} ·{" "}
                  {money(parcel.feeCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="page-controls">
        {cursor && (
          <button className="secondary" onClick={() => void load()}>
            First page
          </button>
        )}
        {page?.nextCursor && (
          <button
            className="secondary"
            onClick={() => void load(page.nextCursor!)}
          >
            Next page
          </button>
        )}
      </div>
    </section>
  );
}

export function ParcelDetail() {
  const { id = "" } = useParams();
  const [parcel, setParcel] = useState<Awaited<
    ReturnType<typeof getParcel>
  > | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getParcel(id)
      .then((value) => active && setParcel(value))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [id]);
  if (error)
    return (
      <section className="auth-panel">
        <h1>Booking unavailable</h1>
        <p role="alert">{error}</p>
        <Link to="/parcels">Back to bookings</Link>
      </section>
    );
  if (!parcel)
    return (
      <section className="auth-panel" role="status">
        <h1>Loading booking…</h1>
      </section>
    );
  const shareUrl = `${window.location.origin}/track/${parcel.trackingNumber}`;
  return (
    <section className="auth-panel">
      <span className="eyebrow">Delivery details</span>
      <h1>{parcel.trackingNumber}</h1>
      <div className="notice">
        <p>
          {parcel.originTown} → {parcel.destinationTown}
        </p>
        <p>Status: {parcel.status.toLowerCase()}</p>
        <p>
          To: {parcel.recipientName} · {parcel.recipientPhone}
        </p>
        <p>{parcel.recipientAddress}</p>
        <strong>{money(parcel.feeCents)}</strong>
      </div>
      <h2>History</h2>
      <ol className="history-list">
        {parcel.history.map((item, index) => (
          <li key={`${item.createdAt}-${index}`}>
            <strong>{item.status}</strong>
            <span>
              {item.town} · {new Date(item.createdAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
      <label htmlFor="shareLink">Share tracking link</label>
      <input
        id="shareLink"
        readOnly
        value={shareUrl}
        onFocus={(event) => event.currentTarget.select()}
      />
      <small>Anyone with this link can see status, time and town.</small>
      <p>
        <Link to="/parcels">Back to bookings</Link>
      </p>
    </section>
  );
}

export function PublicTracking() {
  const { trackingNumber = "" } = useParams();
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getTracking>
  > | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 15000;
    const fetchStatus = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await getTracking(trackingNumber);
        if (!stopped) {
          setData(next);
          setError("");
        }
      } catch (reason) {
        if (!stopped) setError(errorMessage(reason));
      }
      if (!stopped) {
        timer = setTimeout(fetchStatus, delay);
        delay = Math.min(delay * 2, 60000);
      }
    };
    const visibility = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        void fetchStatus();
      } else if (timer) clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", visibility);
    void fetchStatus();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [trackingNumber, retry]);
  return (
    <section className="auth-panel">
      <span className="eyebrow">SwiftDrop tracking</span>
      <h1>{trackingNumber}</h1>
      {error && (
        <div role="alert" className="notice error">
          {error}
          <button onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}
      {data && (
        <>
          <p>
            {data.originTown} → {data.destinationTown}
          </p>
          <div className="notice">
            Current status: <strong>{data.status.toLowerCase()}</strong>
          </div>
          <h2>Updates</h2>
          <ol className="history-list">
            {data.history.map((item, index) => (
              <li key={`${item.createdAt}-${index}`}>
                <strong>{item.status}</strong>
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

export { AdminZones, AdminPricing } from "../pricing/index.js";
