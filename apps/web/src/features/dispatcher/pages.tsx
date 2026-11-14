import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CourierSummary,
  DispatchParcel,
  DispatchState,
} from "@swiftdrop/contracts";
import { errorMessage } from "../auth/client.js";
import { StatusBadge } from "../../shared/components/StatusBadge.js";
import {
  assignParcel,
  listCouriers,
  listDispatchParcels,
  updateCourierProfile,
} from "./client.js";

const age = (iso: string) => {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  return minutes < 60
    ? `${minutes} min`
    : minutes < 1440
      ? `${Math.round(minutes / 60)} h`
      : `${Math.round(minutes / 1440)} d`;
};

export const courierOption = (courier: CourierSummary) => {
  const label = `${courier.fullName ?? `Courier ${courier.userId}`} — ${courier.workload}/${courier.capacity}`;
  if (!courier.hasProfile)
    return { label: `${label} (no profile)`, disabled: true };
  if (!courier.onDuty) return { label: `${label} (off duty)`, disabled: true };
  if (courier.workload >= courier.capacity)
    return { label: `${label} (full)`, disabled: true };
  return { label, disabled: false };
};

function AssignDialog({
  parcel,
  couriers,
  onClose,
  onDone,
}: {
  parcel: DispatchParcel;
  couriers: CourierSummary[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [courierId, setCourierId] = useState(
    parcel.courierId ? String(parcel.courierId) : "",
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => select.current?.focus(), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!courierId) {
      setError("Choose a courier.");
      select.current?.focus();
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await assignParcel(
        parcel.id,
        Number(courierId),
        parcel.version,
      );
      onDone(
        result.changed
          ? `${parcel.trackingNumber} assigned.`
          : `${parcel.trackingNumber} already belongs to that courier.`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
      select.current?.focus();
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-title"
      className="dispatch-dialog"
      onKeyDown={(event) => {
        if (event.key === "Escape") return onClose();
        if (event.key !== "Tab") return;
        // Keep keyboard focus inside the modal: wrap at the first and last control.
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            "select, button, input, [href]",
          ),
        ].filter((element) => !element.hasAttribute("disabled"));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <h2 id="assign-title">
          {parcel.courierId ? "Reassign" : "Assign"} {parcel.trackingNumber}
        </h2>
        <p className="muted">
          {parcel.originTown} → {parcel.destinationTown}. The parcel version is
          checked, so if someone else changed it you will be asked to refresh.
        </p>
        <div className="field">
          <label htmlFor="assign-courier">Courier</label>
          <select
            id="assign-courier"
            ref={select}
            value={courierId}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "assign-error" : undefined}
            onChange={(event) => setCourierId(event.target.value)}
          >
            <option value="">Select a courier…</option>
            {couriers.map((courier) => {
              const option = courierOption(courier);
              return (
                <option
                  key={courier.userId}
                  value={courier.userId}
                  disabled={
                    option.disabled && courier.userId !== parcel.courierId
                  }
                >
                  {option.label}
                </option>
              );
            })}
          </select>
          {error && (
            <p id="assign-error" role="alert" className="field-error">
              {error}
            </p>
          )}
        </div>
        <div className="row-actions">
          <button className="primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Confirm"}
          </button>
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function CourierRow({
  courier,
  onChanged,
}: {
  courier: CourierSummary;
  onChanged: (message: string) => void;
}) {
  const [capacity, setCapacity] = useState(String(courier.capacity));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save(change: { onDuty?: boolean; capacity?: number }) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await updateCourierProfile(courier.userId, change);
      onChanged(`${courier.fullName ?? "Courier"} updated.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <tr>
      <td>{courier.fullName ?? `Courier ${courier.userId}`}</td>
      <td>
        {courier.workload} / {courier.capacity}
        {!courier.hasProfile && (
          <span className="muted"> · no profile yet</span>
        )}
      </td>
      <td>
        <button
          className="secondary"
          disabled={pending}
          aria-pressed={courier.onDuty}
          onClick={() => void save({ onDuty: !courier.onDuty })}
        >
          {courier.onDuty ? "On duty — set off" : "Off duty — set on"}
        </button>
      </td>
      <td>
        <div className="row-actions">
          <label className="visually-hidden" htmlFor={`cap-${courier.userId}`}>
            Capacity for {courier.fullName ?? courier.userId}
          </label>
          <input
            id={`cap-${courier.userId}`}
            type="number"
            min={1}
            max={100}
            value={capacity}
            style={{ width: "5rem" }}
            onChange={(event) => setCapacity(event.target.value)}
          />
          <button
            className="secondary"
            disabled={pending || Number(capacity) === courier.capacity}
            onClick={() => void save({ capacity: Number(capacity) })}
          >
            Save
          </button>
        </div>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </td>
    </tr>
  );
}

/** Dispatcher console: unassigned queue, safe assign/reassign, courier workload (FR-F8, FR-D1..D3). */
export function DispatcherConsole() {
  const [state, setState] = useState<DispatchState>("unassigned");
  const [zoneId, setZoneId] = useState<number | undefined>();
  const [zones, setZones] = useState<Map<number, string>>(new Map());
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<Array<string | undefined>>([]);
  const [items, setItems] = useState<DispatchParcel[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [couriers, setCouriers] = useState<CourierSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [assigning, setAssigning] = useState<DispatchParcel | null>(null);
  const [refresh, setRefresh] = useState(0);
  const trigger = useRef<HTMLElement | null>(null);

  const reload = useCallback(() => setRefresh((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void Promise.all([
      listDispatchParcels({ state, zoneId, cursor }),
      listCouriers(),
    ])
      .then(([page, people]) => {
        if (!live) return;
        setItems(page.items);
        setNext(page.nextCursor);
        setCouriers(people);
        setZones((known) => {
          const merged = new Map(known);
          for (const item of page.items)
            merged.set(item.originZoneId, item.originTown);
          return merged;
        });
      })
      .catch((cause) => live && setError(errorMessage(cause)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [state, zoneId, cursor, refresh]);

  const courierName = (id: number | null) =>
    id === null
      ? "—"
      : (couriers.find((courier) => courier.userId === id)?.fullName ??
        `Courier ${id}`);

  function resetPaging() {
    setCursor(undefined);
    setHistory([]);
  }

  function closeDialog() {
    setAssigning(null);
    trigger.current?.focus();
  }

  return (
    <section className="admin-panel">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">Dispatch</span>
          <h1>Dispatcher console</h1>
          <p className="muted">
            Assign parcels to couriers who are on duty and have free capacity.
          </p>
        </div>
        <button className="secondary" onClick={reload} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="filter-row">
        <div>
          <label htmlFor="dispatch-state">Show</label>
          <select
            id="dispatch-state"
            value={state}
            onChange={(event) => {
              setState(event.target.value as DispatchState);
              resetPaging();
            }}
          >
            <option value="unassigned">Unassigned queue</option>
            <option value="assigned">Assigned (reassign)</option>
          </select>
        </div>
        <div>
          <label htmlFor="dispatch-zone">Pickup zone</label>
          <select
            id="dispatch-zone"
            value={zoneId ?? ""}
            onChange={(event) => {
              setZoneId(
                event.target.value ? Number(event.target.value) : undefined,
              );
              resetPaging();
            }}
          >
            <option value="">All zones</option>
            {[...zones].map(([id, town]) => (
              <option key={id} value={id}>
                {town}
              </option>
            ))}
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
          <button className="secondary" onClick={reload}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p role="status">Loading parcels…</p>
      ) : !error && items.length === 0 ? (
        <p className="notice">
          {state === "unassigned"
            ? "The queue is empty. New bookings appear here oldest first."
            : "No active parcels are assigned right now."}
        </p>
      ) : (
        !error && (
          <div className="table-scroll">
            <table>
              <caption className="visually-hidden">
                {state === "unassigned"
                  ? "Unassigned parcels"
                  : "Assigned parcels"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Tracking</th>
                  <th scope="col">Route</th>
                  <th scope="col">Status</th>
                  <th scope="col">Waiting</th>
                  <th scope="col">Courier</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((parcel) => (
                  <tr key={parcel.id}>
                    <td>{parcel.trackingNumber}</td>
                    <td>
                      {parcel.originTown} → {parcel.destinationTown}
                    </td>
                    <td>
                      <StatusBadge status={parcel.status} />
                    </td>
                    <td>{age(parcel.createdAt)}</td>
                    <td>{courierName(parcel.courierId)}</td>
                    <td>
                      <button
                        className="secondary"
                        onClick={(event) => {
                          trigger.current = event.currentTarget;
                          setNotice("");
                          setAssigning(parcel);
                        }}
                      >
                        {parcel.courierId ? "Reassign" : "Assign"}
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
          }}
        >
          Previous
        </button>
        <button
          className="secondary"
          disabled={loading || !next}
          onClick={() => {
            if (next) {
              setHistory((entries) => [...entries, cursor]);
              setCursor(next);
            }
          }}
        >
          Next
        </button>
      </div>

      {assigning && (
        <AssignDialog
          parcel={assigning}
          couriers={couriers}
          onClose={closeDialog}
          onDone={(message) => {
            setNotice(message);
            closeDialog();
            reload();
          }}
        />
      )}

      <h2>Courier workload</h2>
      {couriers.length === 0 ? (
        <p className="notice">
          No active couriers yet. An Admin can invite couriers from the users
          page.
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <caption className="visually-hidden">Courier workload</caption>
            <thead>
              <tr>
                <th scope="col">Courier</th>
                <th scope="col">Workload</th>
                <th scope="col">Duty</th>
                <th scope="col">Capacity</th>
              </tr>
            </thead>
            <tbody>
              {couriers.map((courier) => (
                <CourierRow
                  key={`${courier.userId}-${courier.onDuty}-${courier.capacity}`}
                  courier={courier}
                  onChanged={(message) => {
                    setNotice(message);
                    reload();
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
