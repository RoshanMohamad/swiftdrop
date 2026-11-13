import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { merchantRegistrationSchema } from "@swiftdrop/contracts";
import {
  errorMessage,
  listMerchants,
  registerMerchant,
  reviewMerchant,
} from "../auth/client.js";

type Merchant = Awaited<ReturnType<typeof listMerchants>>["items"][number];

export function MerchantSignup() {
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const element = event.currentTarget;
    const values = Object.fromEntries(new FormData(element));
    const input = {
      businessName: values.businessName,
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      password: values.password,
    };
    const parsed = merchantRegistrationSchema.safeParse(input);
    const nextErrors: Record<string, string[]> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        (nextErrors[String(issue.path[0] ?? "form")] ??= []).push(
          issue.message,
        );
    if (values.password !== values.confirm)
      nextErrors.confirm = ["Passwords do not match."];
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage("Check the highlighted fields.");
      element
        .querySelector<HTMLElement>(`[name="${Object.keys(nextErrors)[0]}"]`)
        ?.focus();
      return;
    }
    inFlight.current = true;
    setPending(true);
    setMessage("");
    try {
      const result = await registerMerchant(
        merchantRegistrationSchema.parse(input),
      );
      setComplete(true);
      element.reset();
      setMessage(result.message);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section className="auth-panel">
      <span className="eyebrow">Merchant onboarding</span>
      <h1>Register your business</h1>
      {complete ? (
        <div className="notice" role="status">
          <p>{message}</p>
          <Link to="/auth/login">Continue to sign in</Link>
        </div>
      ) : (
        <>
          <p>
            Submit your details for review. API access becomes available after
            approval.
          </p>
          <form ref={form} onSubmit={(event) => void submit(event)} noValidate>
            <label htmlFor="merchant-business">Business name</label>
            <input
              id="merchant-business"
              name="businessName"
              autoComplete="organization"
              required
              aria-invalid={Boolean(errors.businessName)}
            />
            {errors.businessName?.map((error) => (
              <small key={error}>{error}</small>
            ))}
            <label htmlFor="merchant-name">Contact name</label>
            <input
              id="merchant-name"
              name="fullName"
              autoComplete="name"
              required
              aria-invalid={Boolean(errors.fullName)}
            />
            {errors.fullName?.map((error) => (
              <small key={error}>{error}</small>
            ))}
            <label htmlFor="merchant-email">Email</label>
            <input
              id="merchant-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email?.map((error) => (
              <small key={error}>{error}</small>
            ))}
            <label htmlFor="merchant-phone">Phone</label>
            <input
              id="merchant-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              aria-invalid={Boolean(errors.phone)}
            />
            {errors.phone?.map((error) => (
              <small key={error}>{error}</small>
            ))}
            <label htmlFor="merchant-password">Password</label>
            <input
              id="merchant-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password?.map((error) => (
              <small key={error}>{error}</small>
            ))}
            <label htmlFor="merchant-confirm">Confirm password</label>
            <input
              id="merchant-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={Boolean(errors.confirm)}
            />
            {errors.confirm?.map((error) => (
              <small key={error}>{error}</small>
            ))}
            <p role="alert">{message}</p>
            <button className="primary" disabled={pending}>
              {pending ? "Submitting…" : "Submit application"}
            </button>
          </form>
        </>
      )}
      <p>
        <Link to="/auth/login">Already registered? Sign in</Link>
      </p>
    </section>
  );
}

export function AdminMerchants() {
  const [rows, setRows] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const actionLock = useRef(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void listMerchants()
      .then(({ items }) => {
        if (live) setRows(items);
      })
      .catch((cause) => {
        if (live) setError(errorMessage(cause));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [refresh]);

  async function decide(row: Merchant, status: "APPROVED" | "REJECTED") {
    if (actionLock.current) return;
    if (
      status === "REJECTED" &&
      !window.confirm(`Reject the application from ${row.businessName}?`)
    )
      return;
    actionLock.current = true;
    setBusyId(row.id);
    setError("");
    setNotice("");
    try {
      await reviewMerchant(row.id, status);
      setNotice(`${row.businessName}: ${status.toLowerCase()}.`);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
      setRefresh((value) => value + 1);
    } finally {
      actionLock.current = false;
      setBusyId(null);
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Merchant applications</h1>
          <p className="muted">
            Review business registrations before API access is enabled.
          </p>
        </div>
      </div>
      <p
        role={error ? "alert" : "status"}
        className={error ? "notice error" : "notice"}
      >
        {error || notice}
      </p>
      {error && (
        <button
          className="secondary"
          onClick={() => setRefresh((value) => value + 1)}
        >
          Retry
        </button>
      )}
      {loading ? (
        <p role="status">Loading applications…</p>
      ) : rows.length === 0 ? (
        <p className="notice">No merchant applications yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Business</th>
                <th scope="col">Contact</th>
                <th scope="col">Email</th>
                <th scope="col">Phone</th>
                <th scope="col">Submitted</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.businessName}</td>
                  <td>{row.fullName}</td>
                  <td>{row.email}</td>
                  <td>{row.phone}</td>
                  <td>{new Date(row.createdAt).toLocaleDateString()}</td>
                  <td>{row.status}</td>
                  <td>
                    {row.status === "PENDING" && (
                      <div className="row-actions">
                        <button
                          className="primary"
                          disabled={busyId !== null}
                          onClick={() => void decide(row, "APPROVED")}
                        >
                          {busyId === row.id ? "Working…" : "Approve"}
                        </button>
                        <button
                          className="secondary"
                          disabled={busyId !== null}
                          onClick={() => void decide(row, "REJECTED")}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
