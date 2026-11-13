import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  createParcel,
  createQuote,
  errorMessage,
  getParcel,
  getParcelReceipt,
  getTracking,
  listParcels,
} from "../auth/client.js";
import {
  bookingRequestSchema,
  quoteRequestSchema,
  type QuoteRequest,
} from "@swiftdrop/contracts";
import { useParcelRealtime } from "../../shared/realtime/index.js";
const money = (cents: number) =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(
    cents / 100,
  );
const statusLabel = (status: string) =>
  status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const statusClass = (status: string) =>
  `status-badge status-${status.toLowerCase().replaceAll("_", "-")}`;

export function NewParcelLegacy() {
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

export function NewParcel() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [quote, setQuote] = useState<Awaited<
    ReturnType<typeof createQuote>
  > | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [request, setRequest] = useState<QuoteRequest>({
    originDistrict: "",
    destinationDistrict: "",
    weightGrams: 0,
    lengthMm: 0,
    widthMm: 0,
    heightMm: 0,
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

  function updateRequest(next: QuoteRequest) {
    setRequest(next);
    setQuote(null);
    setKey("");
    setAttempted(null);
  }

  function validateRecipient() {
    try {
      return bookingRequestSchema.parse({ quoteId: quote?.id, ...recipient });
    } catch (reason) {
      setError(errorMessage(reason));
      return null;
    }
  }

  async function getQuote(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const input = quoteRequestSchema.parse(request);
      setPending(true);
      setQuote(await createQuote(input));
      setKey(crypto.randomUUID());
      setStep(2);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }

  function continueToReview(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (validateRecipient()) setStep(3);
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setError("");
    const input = attempted ?? validateRecipient();
    if (!input || !quote || !key) return;
    setAttempted(input);
    setPending(true);
    try {
      const parcel = await createParcel(input, key);
      navigate(`/parcels/${parcel.id}`, { replace: true });
    } catch (reason) {
      if (reason instanceof ApiError && reason.problem.status === 410) {
        setQuote(null);
        setKey("");
        setAttempted(null);
        setStep(1);
      }
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-panel booking-wizard">
      <span className="eyebrow">Customer booking</span>
      <h1>Send a parcel.</h1>
      <ol className="wizard-progress" aria-label="Booking progress">
        {["Parcel details", "Recipient", "Review"].map((label, index) => {
          const number = index + 1;
          return (
            <li
              key={label}
              className={number === step ? "current" : number < step ? "done" : ""}
              aria-current={number === step ? "step" : undefined}
            >
              <span>{number}</span>
              {label}
            </li>
          );
        })}
      </ol>
      {step === 1 && (
        <form onSubmit={(event) => void getQuote(event)}>
          <h2>Parcel details</h2>
          <p className="muted">
            Your account is the sender. Tell us where the parcel is going and
            how large it is.
          </p>
          <label htmlFor="originDistrict">Pickup district</label>
          <input
            id="originDistrict"
            required
            value={request.originDistrict}
            onChange={(event) =>
              updateRequest({ ...request, originDistrict: event.target.value })
            }
          />
          <label htmlFor="destinationDistrict">Delivery district</label>
          <input
            id="destinationDistrict"
            required
            value={request.destinationDistrict}
            onChange={(event) =>
              updateRequest({
                ...request,
                destinationDistrict: event.target.value,
              })
            }
          />
          <label htmlFor="weight">Weight (grams)</label>
          <input
            id="weight"
            type="number"
            min="1"
            max="30000"
            required
            value={request.weightGrams || ""}
            onChange={(event) =>
              updateRequest({
                ...request,
                weightGrams: Number(event.target.value),
              })
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
                  value={request[field] || ""}
                  onChange={(event) =>
                    updateRequest({
                      ...request,
                      [field]: Number(event.target.value),
                    })
                  }
                />
              </div>
            ))}
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={pending}>
            {pending ? "Getting your quote…" : "Continue to recipient"}
          </button>
        </form>
      )}
      {step === 2 && quote && (
        <form onSubmit={continueToReview}>
          <h2>Recipient details</h2>
          <p className="muted">Who should receive this parcel?</p>
          <label htmlFor="recipientName">Recipient name</label>
          <input
            id="recipientName"
            required
            minLength={2}
            maxLength={120}
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
            value={recipient.recipientAddress}
            onChange={(event) =>
              setRecipient({
                ...recipient,
                recipientAddress: event.target.value,
              })
            }
          />
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="wizard-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setError("");
                setStep(1);
              }}
            >
              Back
            </button>
            <button className="primary">Review booking</button>
          </div>
        </form>
      )}
      {step === 3 && quote && (
        <form onSubmit={(event) => void confirm(event)}>
          <h2>Review booking</h2>
          <div className="notice booking-summary">
            <p>
              <strong>Route</strong> {quote.originTown} →{" "}
              {quote.destinationTown}
            </p>
            <p>
              <strong>Parcel</strong> {request.weightGrams} g ·{" "}
              {request.lengthMm} × {request.widthMm} × {request.heightMm} mm
            </p>
            <p>
              <strong>Recipient</strong> {recipient.recipientName} ·{" "}
              {recipient.recipientPhone}
            </p>
            <p>
              <strong>Address</strong> {recipient.recipientAddress}
            </p>
            <strong className="quote-total">{money(quote.feeCents)}</strong>
            <p>Quote valid until {new Date(quote.expiresAt).toLocaleString()}.</p>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="wizard-actions">
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => {
                setAttempted(null);
                setError("");
                setStep(2);
              }}
            >
              Edit recipient
            </button>
            <button className="primary" disabled={pending}>
              {pending
                ? "Confirming booking…"
                : attempted
                  ? "Retry booking"
                  : "Confirm booking"}
            </button>
          </div>
        </form>
      )}
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
    setError("");
    setPage(next ? null : null);
    try {
      setPage(await listParcels(next));
      setCursor(next);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="auth-panel parcel-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your deliveries</span>
          <h1>Booking history</h1>
          <p className="muted">Every parcel you have booked, in one place.</p>
        </div>
        <Link className="button-link primary parcel-action" to="/parcels/new">
          Book a delivery
        </Link>
      </div>
      {error && (
        <div role="alert" className="notice error">
          <strong>We couldn’t load your bookings.</strong>
          <p>{error}</p>
          <button className="secondary" onClick={() => void load(cursor)}>
            Try again
          </button>
        </div>
      )}
      {!page && !error ? (
        <p role="status" className="loading-state">Loading your bookings…</p>
      ) : page?.items.length === 0 && !error ? (
        <div className="empty-state">
          <h2>No bookings yet</h2>
          <p>Your deliveries will appear here after you confirm a booking.</p>
          <Link className="button-link primary" to="/parcels/new">
            Book your first delivery
          </Link>
        </div>
      ) : (
        <ul className="parcel-list">
          {page?.items.map((parcel) => (
            <li key={parcel.id}>
              <Link to={`/parcels/${parcel.id}`} className="parcel-card">
                <div className="parcel-card-top">
                  <strong>{parcel.trackingNumber}</strong>
                  <span className={statusClass(parcel.status)}>
                    {statusLabel(parcel.status)}
                  </span>
                </div>
                <span className="parcel-route">
                  {parcel.originTown} <span aria-hidden="true">→</span>{" "}
                  {parcel.destinationTown}
                </span>
                <span className="parcel-card-meta">
                  Booked {new Date(parcel.createdAt).toLocaleDateString()} ·{" "}
                  {money(parcel.feeCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="page-controls" aria-label="Booking history pages">
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
  const [retry, setRetry] = useState(0);
  const [receipt, setReceipt] = useState<Awaited<
    ReturnType<typeof getParcelReceipt>
  > | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const [receiptPending, setReceiptPending] = useState(false);
  const loadParcel = useCallback(async () => {
    try {
      setParcel(await getParcel(id));
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [id]);
  useEffect(() => {
    void loadParcel();
  }, [loadParcel, retry]);
  const realtimeState = useParcelRealtime({
    kind: "private",
    parcelId: id,
    onSnapshot: loadParcel,
    onUpdate: (update) =>
      setParcel((current) => {
        if (!current || current.id !== update.parcelId) return current;
        if (
          current.history.some(
            (item) =>
              item.createdAt === update.occurredAt &&
              item.status === update.status,
          )
        )
          return { ...current, status: update.status };
        return {
          ...current,
          status: update.status,
          history: [
            ...current.history,
            {
              status: update.status,
              town: update.town,
              createdAt: update.occurredAt,
            },
          ],
        };
      }),
  });
  async function prepareReceipt() {
    setReceiptPending(true);
    setReceiptError("");
    try {
      setReceipt(await getParcelReceipt(id));
    } catch (reason) {
      setReceiptError(errorMessage(reason));
    } finally {
      setReceiptPending(false);
    }
  }
  if (error)
    return (
      <section className="auth-panel">
        <h1>Booking unavailable</h1>
        <p role="alert">{error}</p>
        <button className="secondary" onClick={() => setRetry((value) => value + 1)}>
          Try again
        </button>
        <p>
          <Link to="/parcels">Back to bookings</Link>
        </p>
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
    <section className="auth-panel parcel-page">
      <Link className="back-link" to="/parcels">← Back to booking history</Link>
      <div className="detail-heading">
        <div>
          <span className="eyebrow">Delivery details</span>
          <h1>{parcel.trackingNumber}</h1>
          <p className="muted">
            Booked {new Date(parcel.createdAt).toLocaleString()}
          </p>
        </div>
        <span className={statusClass(parcel.status)}>
          {statusLabel(parcel.status)}
        </span>
      </div>
      <p className="muted" role="status">
        {realtimeState === "live"
          ? "Live updates connected."
          : realtimeState === "evicted"
            ? "Live access changed. Refreshing your authorised view."
            : realtimeState === "fallback"
              ? "Live updates unavailable. Showing the latest saved status."
              : "Connecting live updates…"}
      </p>
      <div className="detail-route">
        <span><small>Pickup</small><strong>{parcel.originTown}</strong></span>
        <span className="route-arrow" aria-hidden="true">→</span>
        <span><small>Delivery</small><strong>{parcel.destinationTown}</strong></span>
      </div>
      <div className="detail-grid">
        <section className="detail-card">
          <h2>Recipient</h2>
          <p><strong>{parcel.recipientName}</strong></p>
          <p>{parcel.recipientPhone}</p>
          <p>{parcel.recipientAddress}</p>
        </section>
        <section className="detail-card">
          <h2>Parcel information</h2>
          <dl className="detail-facts">
            <div><dt>Weight</dt><dd>{(parcel.weightGrams / 1000).toFixed(2)} kg</dd></div>
            <div><dt>Dimensions</dt><dd>{parcel.lengthMm} × {parcel.widthMm} × {parcel.heightMm} mm</dd></div>
            <div><dt>Booking total</dt><dd>{money(parcel.feeCents)}</dd></div>
          </dl>
        </section>
      </div>
      <section className="detail-card timeline-card">
        <h2>Tracking timeline</h2>
        {parcel.history.length === 0 ? (
          <p className="muted">No tracking updates have been recorded yet.</p>
        ) : (
          <ol className="history-list">
            {parcel.history.map((item, index) => (
              <li key={`${item.createdAt}-${index}`}>
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <strong>{statusLabel(item.status)}</strong>
                  <span>{item.town} · {new Date(item.createdAt).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="detail-card tracking-share">
        <h2>Public tracking</h2>
        <p className="muted">Share this link so someone can follow the delivery status.</p>
        <label htmlFor="shareLink">Tracking link</label>
        <input id="shareLink" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} />
      </section>
      <section className="detail-card receipt-card">
        <h2>Delivery receipt</h2>
        {parcel.status !== "DELIVERED" ? (
          <p className="muted">
            Your receipt will become available after this parcel is delivered.
          </p>
        ) : receipt ? (
          <>
            <p className="muted">
              Receipt {receipt.receiptReference} · link expires{" "}
              {new Date(receipt.expiresAt).toLocaleTimeString()}
            </p>
            <a
              className="button-link primary"
              href={receipt.downloadUrl}
              target="_blank"
              rel="noreferrer"
              download
              onClick={(event) => {
                if (Date.now() < new Date(receipt.expiresAt).getTime()) return;
                event.preventDefault();
                void prepareReceipt();
              }}
            >
              {Date.now() < new Date(receipt.expiresAt).getTime()
                ? "Download PDF receipt"
                : "Refresh receipt link"}
            </a>
          </>
        ) : (
          <>
            <p className="muted">
              Your completed delivery receipt is stored securely and can be
              requested whenever you need it.
            </p>
            {receiptError && <p role="alert" className="field-error">{receiptError}</p>}
            <button className="secondary" disabled={receiptPending} onClick={() => void prepareReceipt()}>
              {receiptPending ? "Preparing receipt…" : receiptError ? "Try again" : "Get PDF receipt"}
            </button>
          </>
        )}
      </section>
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
  const loadTracking = useCallback(async () => {
    try {
      const next = await getTracking(trackingNumber);
      setData(next);
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [trackingNumber]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 15000;
    const fetchStatus = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        if (!stopped) await loadTracking();
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
  }, [loadTracking, retry]);
  const realtimeState = useParcelRealtime({
    kind: "public",
    trackingNumber,
    onSnapshot: loadTracking,
    onUpdate: (update) =>
      setData((current) => {
        if (!current) return current;
        if (
          current.history.some(
            (item) =>
              item.createdAt === update.occurredAt &&
              item.status === update.status,
          )
        )
          return { ...current, status: update.status };
        return {
          ...current,
          status: update.status,
          history: [
            ...current.history,
            {
              status: update.status,
              town: update.town,
              createdAt: update.occurredAt,
            },
          ],
        };
      }),
  });
  return (
    <section className="auth-panel">
      <span className="eyebrow">SwiftDrop tracking</span>
      <h1>{trackingNumber}</h1>
      <p className="muted" role="status">
        {realtimeState === "live"
          ? "Live tracking connected."
          : realtimeState === "fallback"
            ? "Live tracking unavailable. Automatic refresh is still active."
            : "Connecting live tracking…"}
      </p>
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
