import { type FormEvent, useState } from "react";
import { useParams } from "react-router-dom";
import { errorMessage } from "../auth/client.js";
import { updateParcelStatus, cancelParcel } from "../tracking/client.js";

// Staff operational status update — DISPATCHER / ADMIN (FR-F8 / FR-P4)
export function StaffStatusUpdate() {
  const { id = "" } = useParams();
  const [to, setTo] = useState("PICKED_UP");
  const [town, setTown] = useState("");
  const [version, setVersion] = useState(1);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult("");
    setPending(true);
    try {
      const res = await updateParcelStatus(id, {
        to: to as
          | "PICKED_UP"
          | "IN_TRANSIT"
          | "OUT_FOR_DELIVERY"
          | "DELIVERED"
          | "FAILED",
        town,
        version,
      });
      setResult(
        `Status updated to ${res.status} (version ${res.version}, attempts ${res.attemptCount})`,
      );
      setVersion(res.version);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-panel">
      <span className="eyebrow">Staff operations</span>
      <h1>Update parcel status</h1>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="to">New status</label>
        <select
          id="to"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        >
          <option value="PICKED_UP">Picked up</option>
          <option value="IN_TRANSIT">In transit</option>
          <option value="OUT_FOR_DELIVERY">Out for delivery</option>
          <option value="DELIVERED">Delivered</option>
          <option value="FAILED">Delivery failed</option>
        </select>
        <label htmlFor="town">Current town</label>
        <input
          id="town"
          required
          minLength={1}
          maxLength={80}
          value={town}
          onChange={(event) => setTown(event.target.value)}
        />
        <label htmlFor="version">Parcel version</label>
        <input
          id="version"
          type="number"
          min={1}
          required
          value={version}
          onChange={(event) => setVersion(Number(event.target.value))}
        />
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {result && (
          <p role="status" className="notice">
            {result}
          </p>
        )}
        <button className="primary" disabled={pending}>
          {pending ? "Updating…" : "Update status"}
        </button>
      </form>
    </section>
  );
}

// Pre-pickup cancellation — CUSTOMER (own) / DISPATCHER / ADMIN (FR-P9)
export function StaffCancelParcel() {
  const { id = "" } = useParams();
  const [version, setVersion] = useState(1);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult("");
    setPending(true);
    try {
      const res = await cancelParcel(id, version);
      setResult(`Parcel cancelled (version ${res.version})`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-panel">
      <span className="eyebrow">Staff operations</span>
      <h1>Cancel parcel</h1>
      <div className="notice">
        Cancellation is only allowed before pickup. This action cannot be
        undone.
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="version">Parcel version</label>
        <input
          id="version"
          type="number"
          min={1}
          required
          value={version}
          onChange={(event) => setVersion(Number(event.target.value))}
        />
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {result && (
          <p role="status" className="notice">
            {result}
          </p>
        )}
        <button className="primary" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel parcel"}
        </button>
      </form>
    </section>
  );
}
