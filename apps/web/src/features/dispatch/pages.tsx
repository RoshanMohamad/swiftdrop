import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ApiError,
  assignDispatchParcel,
  errorMessage,
  getDispatchParcelAssignment,
  listCourierCapacity,
  listDispatchAssignments,
  listDispatchParcels,
  listDispatchHistory,
  logout,
} from "../auth/client.js";
import { useSession } from "../auth/session.js";

type Parcel = Awaited<ReturnType<typeof listDispatchParcels>>["items"][number];
type Courier = Awaited<ReturnType<typeof listCourierCapacity>>["items"][number];
type Assignment = Awaited<
  ReturnType<typeof listDispatchAssignments>
>["items"][number];

const pageSize = 10;
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-LK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const statusLabel = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

function DispatchSidebar() {
  const location = useLocation();
  const { clear } = useSession();
  const [pending, setPending] = useState(false);
  const links = [
    { href: "/dispatcher", label: "Dispatch Dashboard", icon: "▦" },
    { href: "/dispatcher/parcels", label: "Unassigned Parcels", icon: "□" },
    { href: "/dispatcher/couriers", label: "Courier Workload", icon: "♙" },
    { href: "/dispatcher/assignments", label: "Assignments", icon: "↗" },
    { href: "/dispatcher/history", label: "History", icon: "◷" },
  ];
  return (
    <aside className="dispatch-sidebar">
      <Link to="/dispatcher" className="dispatch-brand">
        <span className="dispatch-brand-mark" aria-hidden="true">↗</span>
        <span>SwiftDrop<span className="brand-dot">.</span></span>
      </Link>
      <nav aria-label="Dispatcher navigation" className="dispatch-nav">
        {links.map((link) => {
          const active =
            location.pathname === link.href ||
            (link.href !== "/dispatcher" &&
              location.pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              to={link.href}
              className={active ? "dispatch-nav-link active" : "dispatch-nav-link"}
              aria-current={active ? "page" : undefined}
            >
              <span aria-hidden="true">{link.icon}</span>
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="dispatch-account">
        <span className="dispatch-avatar" aria-hidden="true">D</span>
        <div>
          <strong>Dispatcher</strong>
          <span>Operations desk</span>
        </div>
        <button
          className="dispatch-logout"
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void logout()
              .catch(() => undefined)
              .finally(() => {
                clear();
                setPending(false);
              });
          }}
        >
          {pending ? "Logging out…" : "Logout"}
        </button>
      </div>
    </aside>
  );
}

function DispatchShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="dispatch-shell">
      <DispatchSidebar />
      <div className="dispatch-main">
        <header className="dispatch-topbar">
          <div>
            <span className="dispatch-eyebrow">Across Sri Lanka</span>
            <span className="dispatch-breadcrumb"> / {title}</span>
          </div>
          <span className="dispatch-top-avatar" aria-label="Dispatcher profile">D</span>
        </header>
        <main className="dispatch-content">{children}</main>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  to,
}: {
  icon: string;
  label: string;
  value: number;
  detail: string;
  to: string;
}) {
  return (
    <Link to={to} className="dispatch-stat-card">
      <span className="dispatch-stat-icon" aria-hidden="true">{icon}</span>
      <span className="dispatch-stat-label">{label}</span>
      <strong>{value}</strong>
      <span className="dispatch-stat-detail">{detail}</span>
    </Link>
  );
}

function ParcelTable({
  parcels,
  onAssign,
}: {
  parcels: Parcel[];
  onAssign: (parcel: Parcel) => void;
}) {
  return (
    <div className="dispatch-table-wrap">
      <table className="dispatch-table">
        <thead>
          <tr>
            <th>Tracking number</th>
            <th>Pickup zone</th>
            <th>Destination</th>
            <th>Created</th>
            <th>Status</th>
            <th><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {parcels.map((parcel) => (
            <tr key={parcel.id}>
              <td><strong>{parcel.trackingNumber}</strong></td>
              <td>{parcel.originTown}</td>
              <td>{parcel.destinationTown}</td>
              <td>{dateTime(parcel.createdAt)}</td>
              <td>
                <span className={`dispatch-status status-${parcel.status.toLowerCase()}`}>
                  <span aria-hidden="true">●</span> {statusLabel(parcel.status)}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  className="dispatch-primary-button"
                  onClick={() => onAssign(parcel)}
                  aria-label={`Assign courier to ${parcel.trackingNumber}`}
                >
                  Assign Courier
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueueCard({
  parcels,
  onAssign,
}: {
  parcels: Parcel[];
  onAssign: (parcel: Parcel) => void;
}) {
  return (
    <section className="dispatch-card dispatch-queue-card">
      <div className="dispatch-section-heading">
        <div>
          <h2>Unassigned Parcels</h2>
          <p>Parcels ready to be assigned to a courier.</p>
        </div>
        <Link to="/dispatcher/parcels" className="dispatch-text-link">View all →</Link>
      </div>
      {parcels.length ? (
        <ParcelTable parcels={parcels} onAssign={onAssign} />
      ) : (
        <div className="dispatch-empty"><strong>Queue is clear</strong><span>There are no unassigned parcels right now.</span></div>
      )}
    </section>
  );
}

export function AssignmentModal({
  parcel,
  onClose,
  onSuccess,
  onConflict,
  mode = "assign",
  currentAssignment: initialAssignment = null,
}: {
  parcel: Parcel | null;
  onClose: () => void;
  onSuccess: () => void;
  onConflict: () => void;
  mode?: "assign" | "reassign";
  currentAssignment?: Assignment | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [activeParcel, setActiveParcel] = useState<Parcel | null>(null);
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(
    null,
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!parcel) return;
    let cancelled = false;
    const previous = document.activeElement as HTMLElement | null;
    setActiveParcel(parcel);
    setCurrentAssignment(initialAssignment);
    setSelectedCourier(null);
    setSearch("");
    setError("");
    setSuccess("");
    setLoading(true);
    submittingRef.current = false;
    void Promise.all([
      listCourierCapacity(),
      mode === "reassign"
        ? getDispatchParcelAssignment(parcel.id)
        : Promise.resolve(null),
    ])
      .then(([result, details]) => {
        if (cancelled) return;
        setCouriers(result.items);
        if (details) {
          setActiveParcel(details.parcel);
          setCurrentAssignment(details.assignment);
        }
      })
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));

    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submittingRef.current) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), [href]",
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelled = true;
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [initialAssignment, mode, onClose, parcel]);

  if (!parcel || !activeParcel) return null;
  const displayParcel = activeParcel;
  const query = search.trim().toLowerCase();
  const visibleCouriers = couriers.filter((courier) =>
    !query ||
    courier.fullName.toLowerCase().includes(query) ||
    String(courier.courierUserId).includes(query),
  );
  const selected = couriers.find(
    (courier) => courier.courierUserId === selectedCourier,
  );
  async function submit() {
    if (!selected || !displayParcel || submitting) return;
    if (mode === "reassign" && !currentAssignment) {
      setError("The current assignment could not be loaded. Refresh and try again.");
      return;
    }
    setSubmitting(true);
    submittingRef.current = true;
    setError("");
    setSuccess("");
    try {
      await assignDispatchParcel(displayParcel.id, {
        courierUserId: selected.courierUserId,
        dispatchVersion: displayParcel.dispatchVersion,
      });
      setSuccess(
        `${mode === "reassign" ? "Courier reassigned for" : "Courier assigned to"} ${displayParcel.trackingNumber}.`,
      );
      onSuccess();
    } catch (cause) {
      if (cause instanceof ApiError && cause.problem.status === 409) {
        if (cause.problem.code === "VERSION_CONFLICT") {
          setError("This parcel changed while you were reviewing it. Review the refreshed queue before trying again.");
          onConflict();
        } else if (cause.problem.code === "COURIER_CAPACITY_EXCEEDED") {
          setError("That courier no longer has available capacity. Choose another courier.");
        } else if (cause.problem.code === "COURIER_UNAVAILABLE") {
          setError("That courier is no longer on duty. Choose another courier.");
        } else {
          setError(cause.problem.detail);
        }
      } else {
        setError(errorMessage(cause));
      }
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }
  return (
    <div className="dispatch-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <div
        ref={dialogRef}
        className="dispatch-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-dialog-title"
        aria-describedby="assignment-dialog-description"
        tabIndex={-1}
      >
        <div className="dispatch-modal-header">
          <div className="dispatch-modal-title">
            <span className="dispatch-modal-icon" aria-hidden="true">▣</span>
            <div>
              <h2 id="assignment-dialog-title">
                {mode === "reassign" ? "Reassign Courier" : "Assign Courier"}
              </h2>
              <p id="assignment-dialog-description">
                {mode === "reassign"
                  ? "Select another available courier for this parcel."
                  : "Select an available courier for this parcel."}
              </p>
            </div>
          </div>
          <button type="button" className="dispatch-modal-close" onClick={onClose} disabled={submitting} aria-label="Close assignment dialog">×</button>
        </div>
        <div className="dispatch-parcel-summary">
          <div><span>Tracking number</span><strong>{displayParcel.trackingNumber}</strong></div>
          <div><span>Pickup zone</span><strong>{displayParcel.originTown}</strong></div>
          <div><span>Destination</span><strong>{displayParcel.destinationTown}</strong></div>
          <div><span>Status</span><strong>{statusLabel(displayParcel.status)}</strong></div>
          <div><span>Created</span><strong>{dateTime(displayParcel.createdAt)}</strong></div>
        </div>
        <div className="dispatch-modal-section">
          <div className="dispatch-section-heading">
            <div><h3>Select a Courier</h3><p>Only on-duty couriers with available capacity can be selected.</p></div>
            <strong>
              {couriers.filter(
                (courier) =>
                  courier.onDuty &&
                  courier.availableCapacity > 0 &&
                  courier.courierUserId !== currentAssignment?.courierUserId,
              ).length} eligible
            </strong>
          </div>
          <label htmlFor="assignment-courier-search">Search courier</label>
          <input id="assignment-courier-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or ID" />
          {error && <div className="dispatch-modal-error" role="alert">{error}</div>}
          {success && <div className="dispatch-modal-success" role="status">{success}</div>}
          {loading ? <div className="dispatch-loading">Loading courier capacity…</div> : visibleCouriers.length ? (
            <div className="dispatch-courier-options" role="radiogroup" aria-label="Available couriers">
              {visibleCouriers.map((courier) => {
                const isCurrent =
                  mode === "reassign" &&
                  courier.courierUserId === currentAssignment?.courierUserId;
                const eligible =
                  !isCurrent &&
                  courier.onDuty &&
                  courier.maxCapacity > 0 &&
                  courier.availableCapacity > 0;
                const reason = isCurrent
                  ? "Current courier"
                  : !courier.onDuty
                    ? "Off duty"
                    : courier.maxCapacity <= 0
                      ? "Invalid capacity"
                      : "At maximum capacity";
                return (
                  <label key={courier.courierUserId} className={`dispatch-courier-option ${selectedCourier === courier.courierUserId ? "selected" : ""} ${!eligible ? "unavailable" : ""}`}>
                    <input type="radio" name="assignment-courier" value={courier.courierUserId} checked={selectedCourier === courier.courierUserId} disabled={!eligible || submitting} onChange={() => setSelectedCourier(courier.courierUserId)} />
                    <span className="dispatch-courier-avatar" aria-hidden="true">{initials(courier.fullName || `Courier ${courier.courierUserId}`)}</span>
                    <span className="dispatch-courier-option-name"><strong>{courier.fullName || "Unnamed courier"}</strong><small>ID {courier.courierUserId}</small></span>
                    <span className="dispatch-courier-option-meta">{courier.currentWorkload}/{courier.maxCapacity} assigned<br />{courier.availableCapacity} slots</span>
                    <span className={`dispatch-duty-badge ${courier.onDuty ? "on-duty" : "off-duty"}`}>{courier.onDuty ? "On duty" : "Off duty"}</span>
                    {!eligible && <small className="dispatch-unavailable-reason">{reason}</small>}
                  </label>
                );
              })}
            </div>
          ) : <div className="dispatch-empty"><strong>No eligible couriers found</strong><span>Try another search or check courier availability.</span></div>}
        </div>
        <div className="dispatch-modal-footer">
          <button type="button" className="dispatch-secondary-button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="button" className="dispatch-primary-button" onClick={() => void submit()} disabled={!selected || submitting || loading}>
            {submitting
              ? mode === "reassign"
                ? "Reassigning…"
                : "Assigning…"
              : mode === "reassign"
                ? "Confirm Reassignment →"
                : "Confirm Assignment →"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DispatchDashboard() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Parcel | null>(null);
  const [success, setSuccess] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void Promise.all([listDispatchParcels(), listCourierCapacity()])
      .then(([queue, capacity]) => {
        setParcels(queue.items);
        setCouriers(capacity.items);
      })
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);
  const activeAssignments = couriers.reduce((sum, courier) => sum + courier.currentWorkload, 0);
  const availableCouriers = couriers.filter(
    (courier) => courier.onDuty && courier.availableCapacity > 0,
  ).length;

  return (
    <DispatchShell title="Dispatch Dashboard">
      <div className="dispatch-heading">
        <div>
          <span className="dispatch-eyebrow">Operations overview</span>
          <h1>Dispatch Dashboard</h1>
          <p>Overview of parcel dispatching and courier capacity.</p>
        </div>
        <time dateTime={new Date().toISOString()}>{new Date().toLocaleDateString("en-LK", { dateStyle: "long" })}</time>
      </div>
      {error && <ErrorState message={error} onRetry={load} />}
      {loading ? <LoadingState /> : (
        <>
          <div className="dispatch-stats">
            <StatCard icon="□" label="Unassigned Parcels" value={parcels.length} detail="Awaiting courier assignment" to="/dispatcher/parcels" />
            <StatCard icon="♙" label="Available Couriers" value={availableCouriers} detail="On duty and has capacity" to="/dispatcher/couriers" />
            <StatCard icon="▣" label="Active Assignments" value={activeAssignments} detail="Parcels currently assigned" to="/dispatcher/assignments" />
          </div>
          <QueueCard parcels={parcels.slice(0, pageSize)} onAssign={(parcel) => { setSuccess(""); setSelected(parcel); }} />
        </>
      )}
      {success && <div className="dispatch-notice" role="status">{success}</div>}
      <AssignmentModal
        parcel={selected}
        onClose={() => setSelected(null)}
        onConflict={load}
        onSuccess={() => {
          setSelected(null);
          setSuccess("Parcel assignment completed successfully.");
          load();
        }}
      />
    </DispatchShell>
  );
}

function LoadingState() {
  return <div className="dispatch-loading" role="status">Loading dispatch data…</div>;
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="dispatch-error" role="alert"><strong>Unable to load dispatch data.</strong><span>{message}</span><button type="button" onClick={onRetry}>Retry</button></div>;
}

export function UnassignedParcelsPage() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [zone, setZone] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Parcel | null>(null);
  const [success, setSuccess] = useState("");
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void listDispatchParcels(zone ? Number(zone) : undefined, 100)
      .then((result) => setParcels(result.items))
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, [zone]);
  useEffect(() => load(), [load]);
  useEffect(() => setPage(0), [search, zone]);
  const filtered = useMemo(
    () => parcels.filter((parcel) =>
      parcel.trackingNumber.toLowerCase().includes(search.toLowerCase()) ||
      parcel.originTown.toLowerCase().includes(search.toLowerCase()) ||
      parcel.destinationTown.toLowerCase().includes(search.toLowerCase()),
    ),
    [parcels, search],
  );
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  return (
    <DispatchShell title="Unassigned Parcels">
      <div className="dispatch-heading">
        <div><span className="dispatch-eyebrow">Dispatch queue</span><h1>Unassigned Parcels</h1><p>Review the FIFO queue and prepare parcels for courier assignment.</p></div>
      </div>
      <section className="dispatch-card">
        <div className="dispatch-filters">
          <div><label htmlFor="parcel-search">Search parcels</label><input id="parcel-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tracking number or town" /></div>
          <div><label htmlFor="pickup-zone">Pickup zone ID</label><input id="pickup-zone" type="number" min="1" value={zone} onChange={(event) => setZone(event.target.value)} placeholder="All zones" /></div>
          <button type="button" className="dispatch-secondary-button" onClick={() => { setSearch(""); setZone(""); }}>Clear filters</button>
        </div>
        {error ? <ErrorState message={error} onRetry={load} /> : loading ? <LoadingState /> : visible.length ? <ParcelTable parcels={visible} onAssign={(parcel) => { setSuccess(""); setSelected(parcel); }} /> : <div className="dispatch-empty"><strong>No parcels found</strong><span>Try clearing the filters or check again later.</span></div>}
        {!loading && !error && filtered.length > 0 && <div className="dispatch-pagination"><span>{filtered.length} visible parcel{filtered.length === 1 ? "" : "s"}</span><div><button type="button" className="dispatch-secondary-button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page + 1} of {pages}</span><button type="button" className="dispatch-secondary-button" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>Next →</button></div></div>}
      </section>
      {success && <div className="dispatch-notice" role="status">{success}</div>}
      <AssignmentModal
        parcel={selected}
        onClose={() => setSelected(null)}
        onConflict={load}
        onSuccess={() => {
          setSelected(null);
          setSuccess("Parcel assignment completed successfully.");
          load();
        }}
      />
    </DispatchShell>
  );
}

function CapacitySkeleton() {
  return (
    <div className="dispatch-table-wrap" role="status" aria-label="Loading courier capacity">
      <table className="dispatch-table dispatch-courier-table">
        <tbody>
          {[1, 2, 3, 4].map((row) => (
            <tr key={row} className="dispatch-skeleton-row">
              <td><span className="dispatch-skeleton dispatch-skeleton-wide" /></td>
              <td><span className="dispatch-skeleton" /></td>
              <td><span className="dispatch-skeleton" /></td>
              <td><span className="dispatch-skeleton" /></td>
              <td><span className="dispatch-skeleton dispatch-skeleton-bar" /></td>
              <td><span className="dispatch-skeleton" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UtilizationBar({ value }: { value: number }) {
  const percentage = Math.min(100, Math.max(0, value));
  const tone = percentage >= 100 ? "full" : percentage >= 75 ? "high" : "normal";
  return (
    <div className="dispatch-utilization">
      <div className={`dispatch-progress ${tone}`} aria-label={`${percentage}% utilized`}>
        <span style={{ width: `${percentage}%` }} />
      </div>
      <span>{percentage.toFixed(1)}%</span>
    </div>
  );
}

export function CourierWorkloadPage() {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [search, setSearch] = useState("");
  const [duty, setDuty] = useState<"ALL" | "ON_DUTY" | "OFF_DUTY">("ALL");
  const [sortUtilization, setSortUtilization] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void listCourierCapacity()
      .then((result) => setCouriers(result.items))
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);
  useEffect(() => setPage(0), [search, duty, sortUtilization]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = couriers.filter((courier) => {
      const matchesSearch =
        !query ||
        courier.fullName.toLowerCase().includes(query) ||
        String(courier.courierUserId).includes(query);
      const matchesDuty =
        duty === "ALL" ||
        (duty === "ON_DUTY" ? courier.onDuty : !courier.onDuty);
      return matchesSearch && matchesDuty;
    });
    if (sortUtilization)
      return [...result].sort(
        (left, right) => right.utilizationPercent - left.utilizationPercent,
      );
    return result;
  }, [couriers, duty, search, sortUtilization]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const onDuty = couriers.filter((courier) => courier.onDuty).length;
  const totalAssigned = couriers.reduce(
    (total, courier) => total + courier.currentWorkload,
    0,
  );
  const averageUtilization = couriers.length
    ? couriers.reduce((total, courier) => total + courier.utilizationPercent, 0) /
      couriers.length
    : 0;

  return (
    <DispatchShell title="Courier Workload">
      <div className="dispatch-heading">
        <div>
          <span className="dispatch-eyebrow">Capacity management</span>
          <h1>Courier Workload</h1>
          <p>Monitor courier availability, assigned parcels, and delivery capacity.</p>
        </div>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <CapacitySkeleton />
      ) : (
        <>
          <div className="dispatch-stats dispatch-courier-stats">
            <StatCard icon="♙" label="Total Couriers" value={couriers.length} detail="Courier profiles" to="/dispatcher/couriers" />
            <StatCard icon="●" label="On Duty Couriers" value={onDuty} detail="Currently available for work" to="/dispatcher/couriers" />
            <StatCard icon="▣" label="Total Assigned Parcels" value={totalAssigned} detail="Active courier workload" to="/dispatcher/couriers" />
            <div className="dispatch-stat-card dispatch-stat-card-static">
              <span className="dispatch-stat-icon" aria-hidden="true">%</span>
              <span className="dispatch-stat-label">Average Utilization</span>
              <strong>{averageUtilization.toFixed(1)}%</strong>
              <span className="dispatch-stat-detail">Across all courier profiles</span>
            </div>
          </div>
          <section className="dispatch-card">
            <div className="dispatch-section-heading">
              <div>
                <h2>Couriers ({filtered.length})</h2>
                <p>Review active capacity before assigning parcels.</p>
              </div>
            </div>
            <div className="dispatch-filters dispatch-courier-filters">
              <div>
                <label htmlFor="courier-search">Search courier</label>
                <input
                  id="courier-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name or courier ID"
                />
              </div>
              <div>
                <label htmlFor="courier-duty">Duty status</label>
                <select
                  id="courier-duty"
                  value={duty}
                  onChange={(event) =>
                    setDuty(event.target.value as typeof duty)
                  }
                >
                  <option value="ALL">All statuses</option>
                  <option value="ON_DUTY">On duty</option>
                  <option value="OFF_DUTY">Off duty</option>
                </select>
              </div>
              <button
                type="button"
                className="dispatch-secondary-button"
                aria-pressed={sortUtilization}
                onClick={() => setSortUtilization((value) => !value)}
              >
                {sortUtilization ? "Sorted by utilization" : "Sort by utilization"}
              </button>
            </div>
            {visible.length ? (
              <div className="dispatch-table-wrap">
                <table className="dispatch-table dispatch-courier-table">
                  <thead>
                    <tr>
                      <th>Courier</th>
                      <th>Duty status</th>
                      <th>Assigned parcels</th>
                      <th>Maximum capacity</th>
                      <th>Available slots</th>
                      <th>Utilization</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((courier) => (
                      <tr key={courier.courierUserId}>
                        <td>
                          <div className="dispatch-courier-identity">
                            <span className="dispatch-courier-avatar" aria-hidden="true">
                              {initials(courier.fullName || `Courier ${courier.courierUserId}`)}
                            </span>
                            <span>
                              <strong>{courier.fullName || "Unnamed courier"}</strong>
                              <small>ID {courier.courierUserId}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`dispatch-duty-badge ${courier.onDuty ? "on-duty" : "off-duty"}`}>
                            <span aria-hidden="true">●</span>
                            {courier.onDuty ? "On duty" : "Off duty"}
                          </span>
                        </td>
                        <td>{courier.currentWorkload}</td>
                        <td>{courier.maxCapacity}</td>
                        <td>{courier.availableCapacity}</td>
                        <td><UtilizationBar value={courier.utilizationPercent} /></td>
                        <td>
                          <button
                            type="button"
                            className="dispatch-secondary-button"
                            disabled
                            title="Detailed courier assignment data is not available from the current API."
                          >
                            View assignments
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="dispatch-empty">
                <strong>{couriers.length ? "No couriers match these filters" : "No courier profiles found"}</strong>
                <span>{couriers.length ? "Try a different search or duty status." : "Courier capacity data is not available yet."}</span>
              </div>
            )}
            {filtered.length > 0 && (
              <div className="dispatch-pagination">
                <span>{filtered.length} courier{filtered.length === 1 ? "" : "s"} visible</span>
                <div>
                  <button type="button" className="dispatch-secondary-button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>← Previous</button>
                  <span>Page {page + 1} of {pages}</span>
                  <button type="button" className="dispatch-secondary-button" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>Next →</button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </DispatchShell>
  );
}

function AssignmentTable({
  items,
  onReassign,
  history = false,
}: {
  items: Assignment[];
  onReassign?: (assignment: Assignment) => void;
  history?: boolean;
}) {
  return (
    <div className="dispatch-table-wrap">
      <table className="dispatch-table dispatch-assignment-table">
        <thead>
          <tr>
            <th>Tracking number</th>
            <th>Courier</th>
            <th>Route</th>
            <th>Status</th>
            <th>Assigned</th>
            <th>{history ? "Released" : "Actions"}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((assignment) => (
            <tr key={assignment.id}>
              <td>
                <strong>{assignment.parcel.trackingNumber}</strong>
                <small className="dispatch-table-subtext">
                  {assignment.parcel.status.replaceAll("_", " ")}
                </small>
              </td>
              <td>
                <div className="dispatch-courier-identity">
                  <span className="dispatch-courier-avatar" aria-hidden="true">
                    {initials(assignment.courierName || `Courier ${assignment.courierUserId}`)}
                  </span>
                  <span>
                    <strong>{assignment.courierName || "Unnamed courier"}</strong>
                    <small>ID {assignment.courierUserId}</small>
                  </span>
                </div>
              </td>
              <td>
                {assignment.parcel.originTown} → {assignment.parcel.destinationTown}
              </td>
              <td>
                <span className={`dispatch-status status-${assignment.status.toLowerCase()}`}>
                  <span aria-hidden="true">●</span> {statusLabel(assignment.status)}
                </span>
              </td>
              <td>{dateTime(assignment.assignedAt)}</td>
              <td>
                {history ? (
                  assignment.releasedAt ? dateTime(assignment.releasedAt) : "Still active"
                ) : (
                  <button
                    type="button"
                    className="dispatch-primary-button"
                    onClick={() => onReassign?.(assignment)}
                  >
                    Reassign
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssignmentFilters({
  search,
  onSearch,
  status,
  onStatus,
}: {
  search: string;
  onSearch: (value: string) => void;
  status?: "ACTIVE" | "RELEASED" | "ALL";
  onStatus?: (value: "ACTIVE" | "RELEASED" | "ALL") => void;
}) {
  return (
    <div className="dispatch-filters dispatch-assignment-filters">
      <div>
        <label htmlFor="assignment-search">Search assignments</label>
        <input
          id="assignment-search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Tracking number or courier"
        />
      </div>
      {status && onStatus && (
        <div>
          <label htmlFor="assignment-status">Assignment status</label>
          <select
            id="assignment-status"
            value={status}
            onChange={(event) =>
              onStatus(event.target.value as "ACTIVE" | "RELEASED" | "ALL")
            }
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="RELEASED">Released</option>
          </select>
        </div>
      )}
    </div>
  );
}

function AssignmentPagination({
  page,
  totalPages,
  totalItems,
  onPage,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="dispatch-pagination">
      <span>{totalItems} assignment{totalItems === 1 ? "" : "s"}</span>
      <div>
        <button
          type="button"
          className="dispatch-secondary-button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ← Previous
        </button>
        <span>Page {page} of {Math.max(1, totalPages)}</span>
        <button
          type="button"
          className="dispatch-secondary-button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export function AssignmentsPage() {
  const [items, setItems] = useState<Assignment[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Assignment | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void listDispatchAssignments({ page, limit: pageSize, search: search || undefined })
      .then((result) => {
        setItems(result.items);
        setTotalPages(result.totalPages);
        setTotalItems(result.totalItems);
      })
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, [page, search]);
  useEffect(() => load(), [load]);
  useEffect(() => setPage(1), [search]);

  return (
    <DispatchShell title="Assignments">
      <div className="dispatch-heading">
        <div>
          <span className="dispatch-eyebrow">Active dispatch work</span>
          <h1>Assignments</h1>
          <p>Monitor current parcel-to-courier assignments and reassign when needed.</p>
        </div>
      </div>
      <section className="dispatch-card">
        <AssignmentFilters search={search} onSearch={setSearch} />
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          <LoadingState />
        ) : items.length ? (
          <>
            <AssignmentTable items={items} onReassign={setSelected} />
            <AssignmentPagination
              page={page}
              totalPages={totalPages}
              totalItems={totalItems}
              onPage={setPage}
            />
          </>
        ) : (
          <div className="dispatch-empty">
            <strong>No active assignments</strong>
            <span>Assignments will appear here after parcels are assigned.</span>
          </div>
        )}
      </section>
      <AssignmentModal
        parcel={selected?.parcel ?? null}
        currentAssignment={selected}
        mode="reassign"
        onClose={() => setSelected(null)}
        onConflict={() => {
          setSelected(null);
          load();
        }}
        onSuccess={() => {
          setSelected(null);
          load();
        }}
      />
    </DispatchShell>
  );
}

export function DispatchHistoryPage() {
  const [items, setItems] = useState<Assignment[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "RELEASED" | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void listDispatchHistory({
      page,
      limit: pageSize,
      search: search || undefined,
      status: status === "ALL" ? undefined : status,
    })
      .then((result) => {
        setItems(result.items);
        setTotalPages(result.totalPages);
        setTotalItems(result.totalItems);
      })
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, [page, search, status]);
  useEffect(() => load(), [load]);
  useEffect(() => setPage(1), [search, status]);

  return (
    <DispatchShell title="Dispatch History">
      <div className="dispatch-heading">
        <div>
          <span className="dispatch-eyebrow">Dispatch audit trail</span>
          <h1>Dispatch History</h1>
          <p>Review assignment and reassignment events recorded by the dispatch service.</p>
        </div>
      </div>
      <section className="dispatch-card">
        <AssignmentFilters
          search={search}
          onSearch={setSearch}
          status={status}
          onStatus={setStatus}
        />
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          <LoadingState />
        ) : items.length ? (
          <>
            <AssignmentTable items={items} history />
            <AssignmentPagination
              page={page}
              totalPages={totalPages}
              totalItems={totalItems}
              onPage={setPage}
            />
          </>
        ) : (
          <div className="dispatch-empty">
            <strong>No dispatch history found</strong>
            <span>Assignment events will appear here after dispatch activity.</span>
          </div>
        )}
      </section>
    </DispatchShell>
  );
}

export function DispatchPlaceholder({ title }: { title: string }) {
  return <DispatchShell title={title}><div className="dispatch-placeholder"><span className="dispatch-stat-icon" aria-hidden="true">◷</span><h1>{title}</h1><p>This M06 view will be available when the supporting backend endpoint is implemented. No placeholder records are shown.</p><Link to="/dispatcher" className="dispatch-primary-button">Back to dashboard</Link></div></DispatchShell>;
}
