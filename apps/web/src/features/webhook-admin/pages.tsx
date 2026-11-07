import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  webhookReplayRequestSchema,
  type WebhookDeliveryDetail,
  type WebhookDeliveryStatus,
} from "@swiftdrop/contracts";
import { errorMessage } from "../auth/client.js";
import {
  getWebhookDelivery,
  listWebhookDeliveries,
  replayWebhookDelivery,
} from "./client.js";

type Row = Awaited<ReturnType<typeof listWebhookDeliveries>>["items"][number];
const statusText: Record<WebhookDeliveryStatus, string> = {
  PENDING: "Pending / retrying",
  SUCCESS: "Delivered",
  FAILED: "Failed",
  SKIPPED: "Skipped (no webhook set up)",
};
const time = (value: string) => new Date(value).toLocaleString();

function ReplayForm({
  delivery,
  onReplayed,
}: {
  delivery: WebhookDeliveryDetail;
  onReplayed: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const parsed = webhookReplayRequestSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the reason.");
      input.current?.focus();
      return;
    }
    setError("");
    setPending(true);
    try {
      const result = await replayWebhookDelivery(
        delivery.id,
        parsed.data.reason,
      );
      onReplayed(
        `Replay run ${result.runNumber} queued for the original event.`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
      input.current?.focus();
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <p className="muted">
        A replay re-sends the original event (same event id) as a new, audited
        run. Only Admins can replay.
      </p>
      <div className="field">
        <label htmlFor="replay-reason">Reason (kept in the audit log)</label>
        <input
          ref={input}
          id="replay-reason"
          maxLength={200}
          value={reason}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "replay-error" : undefined}
          onChange={(event) => setReason(event.target.value)}
        />
        {error && (
          <p id="replay-error" role="alert" className="field-error">
            {error}
          </p>
        )}
      </div>
      <button className="primary" type="submit" disabled={pending}>
        {pending ? "Queuing replay…" : "Replay delivery"}
      </button>
    </form>
  );
}

function DeliveryDetail({
  id,
  onChanged,
}: {
  id: string;
  onChanged: (message: string) => void;
}) {
  const [detail, setDetail] = useState<WebhookDeliveryDetail | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let live = true;
    setError("");
    void getWebhookDelivery(id)
      .then((value) => live && setDetail(value))
      .catch((cause) => live && setError(errorMessage(cause)));
    return () => {
      live = false;
    };
  }, [id, reload]);
  useEffect(() => {
    if (detail) heading.current?.focus();
  }, [detail?.id]);
  if (error)
    return (
      <div role="alert" className="notice error">
        {error}
        <button className="secondary" onClick={() => setReload((n) => n + 1)}>
          Retry
        </button>
      </div>
    );
  if (!detail) return <p role="status">Loading delivery…</p>;
  return (
    <section aria-labelledby="delivery-heading" className="webhook-detail">
      <h2 id="delivery-heading" tabIndex={-1} ref={heading}>
        Delivery {detail.eventType}
      </h2>
      <p className="muted">
        Event {detail.eventId} · merchant {detail.merchantId} ·{" "}
        {statusText[detail.status]}
      </p>
      <h3>Attempts</h3>
      <div className="table-scroll">
        <table>
          <caption className="visually-hidden">Delivery attempts</caption>
          <thead>
            <tr>
              <th scope="col">Run</th>
              <th scope="col">Attempt</th>
              <th scope="col">Result</th>
              <th scope="col">HTTP</th>
              <th scope="col">Time (ms)</th>
              <th scope="col">Reason</th>
              <th scope="col">Next retry</th>
            </tr>
          </thead>
          <tbody>
            {detail.attempts.map((a) => (
              <tr key={`${a.runNumber}-${a.attempt}`}>
                <td>
                  {a.runNumber === 0 ? "Original" : `Replay ${a.runNumber}`}
                </td>
                <td>{a.attempt}</td>
                <td>{a.outcome ?? "In progress"}</td>
                <td>{a.statusCode ?? "—"}</td>
                <td>{a.latencyMs ?? "—"}</td>
                <td>{a.errorCode ?? "—"}</td>
                <td>{a.nextRetryAt ? time(a.nextRetryAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail.replays.length > 0 && (
        <>
          <h3>Replay history</h3>
          <ul>
            {detail.replays.map((r) => (
              <li key={r.runNumber}>
                Run {r.runNumber} · {time(r.createdAt)} · user{" "}
                {r.requestedByUserId} · {r.reason}
              </li>
            ))}
          </ul>
        </>
      )}
      {detail.status === "FAILED" ? (
        <ReplayForm
          delivery={detail}
          onReplayed={(message) => {
            onChanged(message);
            setReload((n) => n + 1);
          }}
        />
      ) : (
        <p className="muted">Only failed deliveries can be replayed.</p>
      )}
    </section>
  );
}

export function AdminWebhookDeliveries() {
  const [status, setStatus] = useState<"" | WebhookDeliveryStatus>("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<Array<string | undefined>>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void listWebhookDeliveries({ status: status || undefined, cursor })
      .then((page) => {
        if (!live) return;
        setRows(page.items);
        setNext(page.nextCursor);
      })
      .catch((cause) => live && setError(errorMessage(cause)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [status, cursor, refresh]);

  return (
    <section className="admin-panel">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Webhook deliveries</h1>
          <p className="muted">
            Delivery log for merchant webhooks. Failed deliveries can be
            replayed by an Admin.
          </p>
        </div>
      </div>
      <div className="filter-row">
        <div>
          <label htmlFor="webhook-status">Status</label>
          <select
            id="webhook-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setCursor(undefined);
              setHistory([]);
              setSelected(null);
            }}
          >
            <option value="">All statuses</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending / retrying</option>
            <option value="SUCCESS">Delivered</option>
            <option value="SKIPPED">Skipped</option>
          </select>
        </div>
      </div>
      {notice && (
        <p role="status" aria-live="polite" className="notice success">
          {notice}
        </p>
      )}
      {error && (
        <div role="alert" className="notice error">
          {error}
          <button
            className="secondary"
            onClick={() => setRefresh((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading webhook deliveries…</p>
      ) : !error && rows.length === 0 ? (
        <p className="notice">No webhook deliveries match this filter.</p>
      ) : (
        !error && (
          <div className="table-scroll">
            <table>
              <caption className="visually-hidden">Webhook deliveries</caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Merchant</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last problem</th>
                  <th scope="col">Created</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.eventType}</td>
                    <td>{row.merchantId}</td>
                    <td>
                      <span
                        className={`status status-${row.status.toLowerCase()}`}
                      >
                        {statusText[row.status]}
                      </span>
                      {row.currentRun > 0 && <> · run {row.currentRun}</>}
                    </td>
                    <td>{row.lastErrorCode ?? "—"}</td>
                    <td>{time(row.createdAt)}</td>
                    <td>
                      <button
                        className="secondary"
                        aria-expanded={selected === row.id}
                        onClick={() =>
                          setSelected(selected === row.id ? null : row.id)
                        }
                      >
                        {selected === row.id ? "Hide details" : "View details"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <div className="pagination">
        <button
          className="secondary"
          disabled={loading || history.length === 0}
          onClick={() => {
            const previous = [...history];
            setCursor(previous.pop());
            setHistory(previous);
            setSelected(null);
          }}
        >
          Previous
        </button>
        <button
          className="secondary"
          disabled={loading || !next}
          onClick={() => {
            if (next) {
              setHistory((items) => [...items, cursor]);
              setCursor(next);
              setSelected(null);
            }
          }}
        >
          Next
        </button>
      </div>
      {selected && (
        <DeliveryDetail
          id={selected}
          onChanged={(message) => {
            setNotice(message);
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}
