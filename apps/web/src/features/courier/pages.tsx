import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  failureReasons,
  proofContentTypes,
  proofMaxBytes,
  type CourierJob,
  type CourierStatusUpdate,
  type CourierSummary,
  type FailureReason,
  type ParcelStatus,
} from "@swiftdrop/contracts";
import { errorMessage, isLogoutPending } from "../auth/client.js";
import { useSession } from "../auth/session.js";
import { StatusBadge } from "../../shared/components/StatusBadge.js";
import {
  getCourierJobs,
  setDuty,
  updateJobStatus,
  uploadProof,
} from "./client.js";
import {
  createIdbStore,
  expectedVersion,
  newOperationKey,
  replayQueue,
  type QueueStore,
  type QueuedOperation,
} from "./queue.js";

const NEXT: Partial<Record<ParcelStatus, ParcelStatus[]>> = {
  CREATED: ["PICKED_UP"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
};
const ACTION_LABEL: Partial<Record<ParcelStatus, string>> = {
  PICKED_UP: "Mark picked up",
  IN_TRANSIT: "Mark in transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED: "Delivery failed",
};
const REASON_LABEL: Record<FailureReason, string> = {
  RECIPIENT_ABSENT: "Recipient not available",
  WRONG_ADDRESS: "Wrong or incomplete address",
  REFUSED: "Recipient refused the parcel",
  UNREACHABLE: "Could not reach the address",
  OTHER: "Other reason",
};
const cacheKey = (userId: number) => `swiftdrop:courier:jobs:${userId}`;

/** Status a job will have once its queued updates reach the server. */
export function projectedStatus(job: CourierJob, queue: QueuedOperation[]) {
  const pending = queue.filter(
    (item) => item.parcelId === job.id && item.state === "pending",
  );
  return pending.at(-1)?.body.to ?? job.status;
}

function ActionForm({
  job,
  to,
  onSubmit,
  onCancel,
}: {
  job: CourierJob;
  to: ParcelStatus;
  onSubmit: (
    body: Omit<CourierStatusUpdate, "version">,
    photo?: Blob,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [town, setTown] = useState(
    to === "PICKED_UP" || to === "IN_TRANSIT"
      ? job.originTown
      : job.destinationTown,
  );
  const [receivedBy, setReceivedBy] = useState("");
  const [reason, setReason] = useState<FailureReason | "">("");
  const [photo, setPhoto] = useState<Blob | undefined>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const first = useRef<HTMLInputElement | HTMLSelectElement>(null);
  useEffect(() => first.current?.focus(), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (to === "DELIVERED" && receivedBy.trim().length < 2)
      return setError("Enter the name of the person who received the parcel.");
    if (to === "FAILED" && !reason)
      return setError("Choose why the delivery failed.");
    setError("");
    setPending(true);
    try {
      await onSubmit(
        {
          to: to as CourierStatusUpdate["to"],
          town: town.trim() || job.destinationTown,
          ...(to === "DELIVERED" ? { receivedBy: receivedBy.trim() } : {}),
          ...(to === "FAILED" && reason ? { failureReason: reason } : {}),
        },
        to === "DELIVERED" ? photo : undefined,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="courier-action"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <h3>{ACTION_LABEL[to]}</h3>
      <div className="field">
        <label htmlFor="courier-town">Current town</label>
        <input
          id="courier-town"
          value={town}
          maxLength={80}
          onChange={(event) => setTown(event.target.value)}
        />
      </div>
      {to === "DELIVERED" && (
        <>
          <div className="field">
            <label htmlFor="courier-received">Received by (required)</label>
            <input
              id="courier-received"
              ref={first as React.RefObject<HTMLInputElement>}
              value={receivedBy}
              maxLength={120}
              autoComplete="off"
              aria-invalid={Boolean(error) && receivedBy.trim().length < 2}
              onChange={(event) => setReceivedBy(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="courier-photo">
              Photo of the parcel (optional)
            </label>
            <input
              id="courier-photo"
              type="file"
              accept={proofContentTypes.join(",")}
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file && file.size > proofMaxBytes) {
                  setError("Choose a photo under 2 MB.");
                  event.target.value = "";
                  setPhoto(undefined);
                } else {
                  setError("");
                  setPhoto(file);
                }
              }}
            />
            <p className="muted">
              Stored privately; never shown to the recipient.
            </p>
          </div>
        </>
      )}
      {to === "FAILED" && (
        <div className="field">
          <label htmlFor="courier-reason">Reason (required)</label>
          <select
            id="courier-reason"
            ref={first as React.RefObject<HTMLSelectElement>}
            value={reason}
            onChange={(event) => setReason(event.target.value as FailureReason)}
          >
            <option value="">Choose a reason…</option>
            {failureReasons.map((value) => (
              <option key={value} value={value}>
                {REASON_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="row-actions">
        <button
          className="primary courier-tap"
          type="submit"
          disabled={pending}
        >
          {pending ? "Saving…" : "Confirm"}
        </button>
        <button
          className="secondary courier-tap"
          type="button"
          onClick={onCancel}
        >
          Back
        </button>
      </div>
    </form>
  );
}

/** Courier PWA home: today's assigned jobs, status updates, offline queue (FR-F6, FR-K1..K3). */
export function CourierJobs({ store: injected }: { store?: QueueStore } = {}) {
  const { state } = useSession();
  const userId = state.user?.id ?? 0;
  const store = useMemo(() => injected ?? createIdbStore(), [injected]);
  const [jobs, setJobs] = useState<CourierJob[]>([]);
  const [profile, setProfile] = useState<CourierSummary | null>(null);
  const [queue, setQueue] = useState<QueuedOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [action, setAction] = useState<ParcelStatus | null>(null);
  const syncing = useRef(false);

  const refreshQueue = useCallback(async () => {
    setQueue((await store.list()).filter((item) => item.userId === userId));
  }, [store, userId]);

  const loadJobs = useCallback(async () => {
    try {
      const data = await getCourierJobs();
      setJobs(data.items);
      setProfile(data.profile);
      setStale(false);
      setError("");
      try {
        localStorage.setItem(cacheKey(userId), JSON.stringify(data));
      } catch {
        /* storage unavailable: offline snapshot is best effort */
      }
    } catch (cause) {
      try {
        const cached = localStorage.getItem(cacheKey(userId));
        if (cached) {
          const data = JSON.parse(cached) as {
            items: CourierJob[];
            profile: CourierSummary;
          };
          setJobs(data.items);
          setProfile(data.profile);
          setStale(true);
          return;
        }
      } catch {
        /* fall through to the error */
      }
      setError(errorMessage(cause));
    }
  }, [userId]);

  const sync = useCallback(async () => {
    if (syncing.current || !userId) return;
    syncing.current = true;
    try {
      const result = await replayQueue(store, userId, {
        uploadProof,
        update: updateJobStatus,
      });
      if (result.sent > 0) setNotice(`${result.sent} saved update(s) sent.`);
      if (result.stopped === "auth")
        setNotice("Sign in again to send your saved updates.");
      await refreshQueue();
      if (result.sent > 0 || result.review > 0) await loadJobs();
    } finally {
      syncing.current = false;
    }
  }, [store, userId, refreshQueue, loadJobs]);

  useEffect(() => {
    let live = true;
    void (async () => {
      await refreshQueue();
      await sync();
      await loadJobs();
      if (live) setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [refreshQueue, sync, loadJobs]);

  // The cached list holds recipient contact details: drop it when the courier signs out or the
  // session expires. Queued updates stay, so the original user can still send them later.
  useEffect(
    () => () => {
      if (!isLogoutPending()) return;
      try {
        localStorage.removeItem(cacheKey(userId));
      } catch {
        /* storage unavailable */
      }
    },
    [userId],
  );

  useEffect(() => {
    const up = () => {
      setOnline(true);
      void sync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [sync]);

  const job = jobs.find((item) => item.id === selected) ?? null;
  const review = queue.filter((item) => item.state === "review");
  const waiting = queue.filter((item) => item.state === "pending").length;

  async function submitAction(
    target: CourierJob,
    body: Omit<CourierStatusUpdate, "version">,
    photo?: Blob,
  ) {
    const operation: QueuedOperation = {
      key: newOperationKey(),
      userId,
      parcelId: target.id,
      body: {
        ...body,
        version: expectedVersion(target.version, target.id, queue),
      },
      ...(photo ? { photo } : {}),
      createdAt: Date.now(),
      state: "pending",
    };
    await store.put(operation);
    await refreshQueue();
    setAction(null);
    setNotice(
      navigator.onLine
        ? "Saved. Sending…"
        : "Saved on this device. It will send when you are back online.",
    );
    await sync();
  }

  async function toggleDuty() {
    if (!profile) return;
    try {
      setProfile(await setDuty(!profile.onDuty));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <section className="admin-panel courier-home">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">Courier</span>
          <h1>Today’s jobs</h1>
        </div>
        {profile && (
          <button
            className="secondary courier-tap"
            aria-pressed={profile.onDuty}
            onClick={() => void toggleDuty()}
          >
            {profile.onDuty ? "On duty" : "Off duty"} · {profile.workload}/
            {profile.capacity}
          </button>
        )}
      </div>

      {!online && (
        <p role="status" className="notice">
          You are offline. Updates are saved here and sent when you reconnect.
        </p>
      )}
      {stale && (
        <p role="status" className="notice">
          Showing your last saved list; it may be out of date.
        </p>
      )}
      {notice && (
        <p role="status" aria-live="polite" className="notice success">
          {notice}
        </p>
      )}
      {error && (
        <div role="alert" className="notice error">
          {error}
          <button
            className="secondary courier-tap"
            onClick={() => void loadJobs()}
          >
            Retry
          </button>
        </div>
      )}
      {profile && !profile.hasProfile && (
        <p className="notice">
          Your courier profile is not set up yet. A dispatcher must add your
          capacity before you can receive parcels.
        </p>
      )}
      {waiting > 0 && (
        <p className="notice">
          {waiting} update(s) waiting to send.{" "}
          <button className="secondary courier-tap" onClick={() => void sync()}>
            Send now
          </button>
        </p>
      )}
      {review.map((item) => (
        <div role="alert" className="notice error" key={item.key}>
          An update for a parcel could not be applied:{" "}
          {item.problem ?? "it changed on the server"}. Check the job, then
          discard this saved update.
          <button
            className="secondary courier-tap"
            onClick={() =>
              void store.remove(item.key).then(refreshQueue).then(loadJobs)
            }
          >
            Discard saved update
          </button>
        </div>
      ))}

      {loading ? (
        <p role="status">Loading your jobs…</p>
      ) : jobs.length === 0 && !error ? (
        <p className="notice">No parcels are assigned to you right now.</p>
      ) : (
        <ul className="parcel-list courier-list">
          {jobs.map((item) => {
            const status = projectedStatus(item, queue);
            return (
              <li key={item.id}>
                <button
                  className="courier-job courier-tap"
                  aria-expanded={selected === item.id}
                  onClick={() => {
                    setSelected(selected === item.id ? null : item.id);
                    setAction(null);
                  }}
                >
                  <strong>{item.trackingNumber}</strong>
                  <span>
                    {item.originTown} → {item.destinationTown}
                  </span>
                  <StatusBadge status={status} />
                  {status !== item.status && (
                    <span className="muted">Queued</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {job && (
        <article
          className="courier-detail"
          aria-label={`Job ${job.trackingNumber}`}
        >
          <h2>{job.trackingNumber}</h2>
          <dl>
            <dt>Recipient</dt>
            <dd>{job.recipientName}</dd>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${job.recipientPhone}`}>{job.recipientPhone}</a>
            </dd>
            <dt>Address</dt>
            <dd>{job.recipientAddress}</dd>
            <dt>Attempts</dt>
            <dd>{job.attemptCount} of 3</dd>
          </dl>
          {(() => {
            const status = projectedStatus(job, queue);
            const options = NEXT[status] ?? [];
            if (action)
              return (
                <ActionForm
                  key={action}
                  job={job}
                  to={action}
                  onCancel={() => setAction(null)}
                  onSubmit={(body, photo) => submitAction(job, body, photo)}
                />
              );
            if (options.length === 0)
              return (
                <p className="notice">
                  {status === "FAILED"
                    ? "Delivery failed. A dispatcher will schedule a re-attempt."
                    : "No further action for this job."}
                </p>
              );
            return (
              <div className="row-actions">
                {options.map((to) => (
                  <button
                    key={to}
                    className={
                      to === "FAILED"
                        ? "secondary courier-tap"
                        : "primary courier-tap"
                    }
                    onClick={() => setAction(to)}
                  >
                    {ACTION_LABEL[to]}
                  </button>
                ))}
              </div>
            );
          })()}
        </article>
      )}
    </section>
  );
}
