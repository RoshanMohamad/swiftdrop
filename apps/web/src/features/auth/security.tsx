import { useCallback, useEffect, useState, type FormEvent } from "react";
import { passwordSchema, type SessionSummary } from "@swiftdrop/contracts";
import {
  changePassword,
  errorMessage,
  listSessions,
  revokeSession,
} from "./client.js";
import { useSession } from "./session.js";
export { MfaSettings } from "./mfa.js";

const when = (iso: string) => new Date(iso).toLocaleString();

/**
 * Change password with fresh proof of the current one. The server replaces every session with a
 * single new one, which this tab adopts so the user stays signed in here only.
 */
export function ChangePasswordForm({ onChanged }: { onChanged: () => void }) {
  const { accept } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setNotice("");
    const valid = passwordSchema.safeParse(newPassword);
    if (!valid.success) {
      setError(valid.error.issues[0]?.message ?? "Choose a valid password.");
      return;
    }
    if (newPassword !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setPending(true);
    try {
      accept(await changePassword(currentPassword, newPassword));
      setNotice(
        "Password changed. You were signed out of every other device.",
      );
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      // Secrets never linger in the form, whatever the outcome.
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="change-password-title">
      <h2 id="change-password-title">Change password</h2>
      <label htmlFor="current-password">Current password</label>
      <input
        id="current-password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={72}
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
      <label htmlFor="new-password">New password</label>
      <input
        id="new-password"
        type="password"
        autoComplete="new-password"
        required
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
      />
      <label htmlFor="confirm-new-password">Confirm new password</label>
      <input
        id="confirm-new-password"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
      />
      <p
        role={error ? "alert" : "status"}
        aria-live="polite"
        className={
          error ? "notice error" : notice ? "notice success" : undefined
        }
      >
        {error || notice}
      </p>
      <button className="primary" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}

/** The signed-in user's own live sessions, each revocable. */
export function ActiveSessions({ reloadKey }: { reloadKey: number }) {
  const { clear } = useSession();
  const [items, setItems] = useState<SessionSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  /** First page replaces the list (initial load, after a change); a cursor appends the next. */
  const load = useCallback(async (cursor?: string) => {
    setError("");
    try {
      const page = await listSessions(cursor);
      setItems((previous) =>
        cursor && previous ? [...previous, ...page.items] : page.items,
      );
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
      setItems((previous) => previous ?? []);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function more() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await load(nextCursor);
    setLoadingMore(false);
  }

  async function revoke(item: SessionSummary) {
    if (busy) return;
    const question = item.current
      ? "Sign out of this device?"
      : "Sign this device out?";
    if (!window.confirm(question)) return;
    setBusy(item.id);
    setError("");
    try {
      await revokeSession(item.id, item.current);
      if (item.current) {
        clear();
        return;
      }
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="sessions-title">
      <h2 id="sessions-title">Where you are signed in</h2>
      {items === null && <p role="status">Loading sessions…</p>}
      {items?.length === 0 && !error && (
        <p className="muted">No other active sessions.</p>
      )}
      {items && items.length > 0 && (
        <ul className="session-list">
          {items.map((item) => (
            <li key={item.id}>
              <p>
                <strong>{item.current ? "This device" : "Another device"}</strong>
                <br />
                <span className="muted">
                  Signed in {when(item.authenticatedAt)} · last active{" "}
                  {when(item.lastRefreshedAt)}
                </span>
              </p>
              <button
                type="button"
                className="secondary"
                disabled={busy !== null}
                onClick={() => void revoke(item)}
              >
                {busy === item.id ? "Signing out…" : "Sign out"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <button
          type="button"
          className="secondary"
          disabled={loadingMore}
          onClick={() => void more()}
        >
          {loadingMore ? "Loading…" : "Show more sessions"}
        </button>
      )}
      <p role="alert" aria-live="polite" className={error ? "notice error" : undefined}>
        {error}
      </p>
    </section>
  );
}
