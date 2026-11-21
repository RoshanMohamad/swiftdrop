import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { forgotPasswordSchema, passwordSchema } from "@swiftdrop/contracts";
import { errorMessage, requestPasswordReset, resetPassword } from "./client.js";

/**
 * Password recovery (auth plan 4.5). The request page answers every address the same way, so it
 * never reveals whether an account exists; the reset page reads its one-use token from the URL
 * fragment, removes it from the address bar at once, and only submits it in a POST body.
 */
export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError("Enter the email address you registered with.");
      return;
    }
    setPending(true);
    try {
      setNotice((await requestPasswordReset(parsed.data.email)).message);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="forgot-title">
      <span className="eyebrow">Account recovery</span>
      <h1 id="forgot-title">Reset your password.</h1>
      <p className="muted">
        Enter your email. If an account can be reset, we will send a link that
        works once and expires in 30 minutes.
      </p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="forgot-email">Email</label>
        <input
          id="forgot-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby="forgot-status"
        />
        <p
          id="forgot-status"
          role={error ? "alert" : "status"}
          aria-live="polite"
          className={
            error ? "notice error" : notice ? "notice success" : undefined
          }
        >
          {error || notice}
        </p>
        <button className="primary" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <Link className="inline-link" to="/auth/login">
        Back to sign in →
      </Link>
    </section>
  );
}

export function ResetPassword() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const value =
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    setToken(value);
    if (!value)
      setError(
        "This reset link is missing or invalid. Request a new one from the sign-in page.",
      );
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || complete || !token) return;
    setError("");
    const valid = passwordSchema.safeParse(password);
    if (!valid.success) {
      setError(valid.error.issues[0]?.message ?? "Choose a valid password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      setNotice((await resetPassword(token, password)).message);
      setComplete(true);
      setPassword("");
      setConfirm("");
      setToken("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="reset-title">
      <span className="eyebrow">Account recovery</span>
      <h1 id="reset-title">Choose a new password.</h1>
      <p className="muted">
        Use at least 15 characters. Resetting signs you out of every device.
      </p>
      {!complete && token && (
        <form onSubmit={submit} noValidate>
          <label htmlFor="reset-password">Password</label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label htmlFor="reset-confirm">Confirm password</label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          <p
            role={error ? "alert" : "status"}
            aria-live="polite"
            className={error ? "notice error" : undefined}
          >
            {error}
          </p>
          <button className="primary" disabled={pending}>
            {pending ? "Saving…" : "Set password"}
          </button>
        </form>
      )}
      {(complete || !token) && (
        <p
          role={complete ? "status" : "alert"}
          aria-live="polite"
          className={`notice ${complete ? "success" : "error"}`}
        >
          {complete ? notice : error}
        </p>
      )}
      <p>
        {complete ? (
          <Link className="inline-link" to="/auth/login">
            Go to sign in →
          </Link>
        ) : (
          <Link className="inline-link" to="/auth/forgot-password">
            Request a new link →
          </Link>
        )}
      </p>
    </section>
  );
}
