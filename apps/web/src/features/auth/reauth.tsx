import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, errorMessage, reauthenticate, setReauthHandler } from "./client.js";
import { useSession } from "./session.js";

/**
 * Asks for the password (and the authenticator code when the account has one) when the server
 * says a sensitive action needs fresh proof. Mounted once; the API client calls it, then repeats
 * the action that was refused. Cancelling leaves that action unperformed.
 */
export function ReauthDialog() {
  const { state } = useSession();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const settle = useRef<((confirmed: boolean) => void) | null>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status !== "authenticated") return;
    setReauthHandler(
      () =>
        new Promise<boolean>((resolve) => {
          // A second request arriving while the dialog is open waits for the same answer.
          const previous = settle.current;
          settle.current = (confirmed) => {
            previous?.(confirmed);
            resolve(confirmed);
          };
          setOpen(true);
        }),
    );
    return () => setReauthHandler(null);
  }, [state.status]);

  useEffect(() => {
    if (open) passwordInput.current?.focus();
  }, [open]);

  function close(confirmed: boolean) {
    setOpen(false);
    setPassword("");
    setCode("");
    setNeedsCode(false);
    setError("");
    const done = settle.current;
    settle.current = null;
    done?.(confirmed);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await reauthenticate(password, needsCode ? code.trim() : undefined);
      close(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.problem.code === "MFA_CODE_REQUIRED")
        setNeedsCode(true);
      setError(errorMessage(cause));
      setPassword("");
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reauth-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") close(false);
        }}
      >
        <form onSubmit={submit} noValidate>
          <h2 id="reauth-title">Confirm it is you</h2>
          <p className="muted">
            This action needs your password again. Nothing has been changed yet.
          </p>
          <label htmlFor="reauth-password">Password</label>
          <input
            id="reauth-password"
            ref={passwordInput}
            type="password"
            autoComplete="current-password"
            required
            maxLength={72}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {needsCode && (
            <>
              <label htmlFor="reauth-code">6 digit code</label>
              <input
                id="reauth-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </>
          )}
          <p
            role={error ? "alert" : "status"}
            aria-live="polite"
            className={error ? "notice error" : undefined}
          >
            {error}
          </p>
          <button className="primary" disabled={pending}>
            {pending ? "Confirming…" : "Confirm"}
          </button>{" "}
          <button type="button" className="secondary" disabled={pending} onClick={() => close(false)}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
