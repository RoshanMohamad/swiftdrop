import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  createStaffSchema,
  type CreateStaff,
  type Role,
} from "@swiftdrop/contracts";
import {
  createStaff,
  errorMessage,
  listUsers,
  updateUserStatus,
  ApiError,
  updateInvitation,
} from "../auth/client.js";

type Account = Awaited<ReturnType<typeof listUsers>>["items"][number];
const deliveryText = (delivery: "sent" | "failed" | "not_sent") =>
  delivery === "sent"
    ? "Invitation email accepted by the mail server."
    : delivery === "failed"
      ? "Invitation saved, but email could not be sent. Retry from this page."
      : "No email was sent.";

export function AdminUsers() {
  const location = useLocation();
  const [role, setRole] = useState<"" | Role>("");
  const [status, setStatus] = useState<"" | "INVITED" | "ACTIVE" | "SUSPENDED">(
    "",
  );
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<Array<string | undefined>>([]);
  const [rows, setRows] = useState<Account[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<string>(location.state?.notice ?? "");
  const busy = useRef(false);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const [actionError, setActionError] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void listUsers({
      role: role || undefined,
      status: status || undefined,
      cursor,
    })
      .then((page) => {
        if (!live) return;
        if (!page.items.length && cursor) {
          setCursor(undefined);
          setHistory([]);
          return;
        }
        setRows(page.items);
        setNext(page.nextCursor);
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
  }, [role, status, cursor, refresh]);

  function changeFilter(update: () => void) {
    update();
    setCursor(undefined);
    setHistory([]);
  }
  async function action(row: Account, kind: "resend" | "revoke") {
    if (busy.current) return;
    if (
      kind === "revoke" &&
      !window.confirm(
        `Revoke the invitation for ${row.fullName} (${row.email})?`,
      )
    )
      return;
    busy.current = true;
    setActionId(row.id);
    setNotice("");
    setActionError("");
    try {
      const result = await updateInvitation(row.id, kind);
      setNotice(
        kind === "revoke"
          ? `Invitation for ${row.email} revoked.`
          : `${deliveryText(result.delivery)} (${row.email})`,
      );
      setRefresh((n) => n + 1);
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      busy.current = false;
      setActionId(null);
      noticeRef.current?.focus();
    }
  }
  async function changeStatus(row: Account) {
    if (busy.current) return;
    const nextStatus = row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const verb = nextStatus === "SUSPENDED" ? "Suspend" : "Reactivate";
    if (
      !window.confirm(
        `${verb} ${row.fullName ?? "this user"} (${row.email})? ${
          nextStatus === "SUSPENDED"
            ? "All their sessions and pending account actions will be revoked."
            : "They must sign in again. Old sessions will remain revoked."
        }`,
      )
    )
      return;
    busy.current = true;
    setActionId(row.id);
    setNotice("");
    setActionError("");
    try {
      const result = await updateUserStatus(row.id, nextStatus);
      setNotice(
        `${row.email}: ${result.status === "SUSPENDED" ? "suspended; all sessions revoked." : "reactivated; fresh sign-in required."}`,
      );
      setRefresh((n) => n + 1);
    } catch (cause) {
      setActionError(errorMessage(cause));
      if (cause instanceof ApiError && cause.problem.status === 409)
        setRefresh((n) => n + 1);
    } finally {
      busy.current = false;
      setActionId(null);
      noticeRef.current?.focus();
    }
  }
  return (
    <section className="admin-panel">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Users</h1>
          <p className="muted">
            Manage account access for all roles. Invited staff choose their own
            password.
          </p>
        </div>
        <Link className="primary button-link" to="/admin/users/new">
          Invite staff
        </Link>
      </div>
      <div className="filter-row">
        <div>
          <label htmlFor="staff-role">Role</label>
          <select
            id="staff-role"
            value={role}
            onChange={(event) =>
              changeFilter(() => setRole(event.target.value as typeof role))
            }
          >
            <option value="">All roles</option>
            <option value="CUSTOMER">Customer</option>
            <option value="MERCHANT">Merchant</option>
            <option value="ADMIN">Admin</option>
            <option value="DISPATCHER">Dispatcher</option>
            <option value="COURIER">Courier</option>
          </select>
        </div>
        <div>
          <label htmlFor="staff-status">Status</label>
          <select
            id="staff-status"
            value={status}
            onChange={(event) =>
              changeFilter(() => setStatus(event.target.value as typeof status))
            }
          >
            <option value="">All statuses</option>
            <option value="INVITED">Invited</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
      </div>
      <p
        ref={noticeRef}
        tabIndex={-1}
        role={actionError ? "alert" : "status"}
        className={
          notice || actionError
            ? `notice${actionError ? " error" : ""}`
            : undefined
        }
      >
        {actionError || notice}
      </p>
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
        <p role="status">Loading users…</p>
      ) : !error && rows.length === 0 ? (
        <p className="notice">No users match these filters.</p>
      ) : (
        !error && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Invitation</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.fullName ?? "Profile incomplete"}</td>
                    <td>{row.email}</td>
                    <td>{row.role}</td>
                    <td>
                      <span
                        className={`user-status user-status-${row.status.toLowerCase()}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td>
                      {row.invitationExpiresAt
                        ? `Expires ${new Date(row.invitationExpiresAt).toLocaleString()}`
                        : "—"}
                    </td>
                    <td>
                      {row.status === "INVITED" &&
                        ["COURIER", "DISPATCHER"].includes(row.role) && (
                          <div className="row-actions">
                            <button
                              className="secondary"
                              disabled={actionId !== null}
                              onClick={() => void action(row, "resend")}
                            >
                              {actionId === row.id ? "Working…" : "Resend"}
                            </button>
                            <button
                              className="text-button"
                              disabled={
                                actionId !== null || !row.invitationExpiresAt
                              }
                              onClick={() => void action(row, "revoke")}
                            >
                              Revoke
                            </button>
                          </div>
                        )}
                      {row.status !== "INVITED" && (
                        <button
                          className="secondary"
                          disabled={actionId !== null}
                          onClick={() => void changeStatus(row)}
                        >
                          {actionId === row.id
                            ? "Working…"
                            : row.status === "ACTIVE"
                              ? "Suspend"
                              : "Reactivate"}
                        </button>
                      )}
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
              setHistory((items) => [...items, cursor]);
              setCursor(next);
            }
          }}
        >
          Next
        </button>
      </div>
    </section>
  );
}

export function NewStaff() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<CreateStaff>({
    fullName: "",
    email: "",
    phone: "",
    role: "DISPATCHER",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fieldRefs = useRef<
    Record<string, HTMLInputElement | HTMLSelectElement | null>
  >({});
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    const parsed = createStaffSchema.safeParse(fields);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        next[String(issue.path[0] ?? "form")] ??= issue.message;
      setFieldErrors(next);
      const first = Object.keys(next)[0];
      if (first) fieldRefs.current[first]?.focus();
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      const result = await createStaff(parsed.data);
      navigate("/admin/users", {
        state: { notice: `${fields.email}: ${deliveryText(result.delivery)}` },
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="auth-panel">
      <span className="eyebrow">Administration</span>
      <h1>Invite staff</h1>
      <p className="muted">
        The invitee sets a private password. Courier account acceptance remains
        pending until courier setup is ready.
      </p>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <div className="field">
          <label htmlFor="staff-name">Full name</label>
          <input
            ref={(node) => {
              fieldRefs.current.fullName = node;
            }}
            id="staff-name"
            autoComplete="name"
            maxLength={120}
            value={fields.fullName}
            aria-invalid={Boolean(fieldErrors.fullName)}
            aria-describedby={
              fieldErrors.fullName ? "staff-name-error" : undefined
            }
            onChange={(event) =>
              setFields({ ...fields, fullName: event.target.value })
            }
          />
          {fieldErrors.fullName && (
            <p id="staff-name-error" className="field-error">
              {fieldErrors.fullName}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="staff-email">Email address</label>
          <input
            ref={(node) => {
              fieldRefs.current.email = node;
            }}
            id="staff-email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={fields.email}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={
              fieldErrors.email ? "staff-email-error" : undefined
            }
            onChange={(event) =>
              setFields({ ...fields, email: event.target.value })
            }
          />
          {fieldErrors.email && (
            <p id="staff-email-error" className="field-error">
              {fieldErrors.email}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="staff-phone">Sri Lankan phone number</label>
          <input
            ref={(node) => {
              fieldRefs.current.phone = node;
            }}
            id="staff-phone"
            type="tel"
            autoComplete="tel"
            placeholder="0771234567"
            value={fields.phone}
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={
              fieldErrors.phone ? "staff-phone-error" : undefined
            }
            onChange={(event) =>
              setFields({ ...fields, phone: event.target.value })
            }
          />
          {fieldErrors.phone && (
            <p id="staff-phone-error" className="field-error">
              {fieldErrors.phone}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="staff-role-create">Role</label>
          <select
            ref={(node) => {
              fieldRefs.current.role = node;
            }}
            id="staff-role-create"
            value={fields.role}
            onChange={(event) =>
              setFields({
                ...fields,
                role: event.target.value as CreateStaff["role"],
              })
            }
          >
            <option value="DISPATCHER">Dispatcher</option>
            <option value="COURIER">Courier</option>
          </select>
        </div>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <div className="row-actions">
          <button className="primary" disabled={pending}>
            {pending ? "Sending invitation…" : "Create invitation"}
          </button>
          <Link className="secondary button-link" to="/admin/users">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
