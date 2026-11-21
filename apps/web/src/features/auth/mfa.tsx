import { useCallback, useEffect, useState, type FormEvent } from "react";
import { mfaCodeSchema, type MfaStatus, type Session } from "@swiftdrop/contracts";
import {
  completeMfa,
  confirmMfa,
  disableMfa,
  enrolMfa,
  errorMessage,
  getMfaStatus,
  recoverMfa,
  regenerateRecoveryCodes,
} from "./client.js";

/** Second step of sign-in: an authenticator code, or one recovery code. */
export function MfaChallengeStep({
  challengeToken,
  onSession,
  onCancel,
}: {
  challengeToken: string;
  onSession: (session: Session) => void;
  onCancel: () => void;
}) {
  const [recovery, setRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    if (!recovery && !mfaCodeSchema.safeParse(value.trim()).success) {
      setError("Enter the 6 digit code from your authenticator app.");
      return;
    }
    if (recovery && value.trim().length < 10) {
      setError("Enter one of your recovery codes.");
      return;
    }
    setPending(true);
    try {
      onSession(
        recovery
          ? await recoverMfa(challengeToken, value.trim())
          : await completeMfa(challengeToken, value.trim()),
      );
    } catch (cause) {
      setError(errorMessage(cause));
      setValue("");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="mfa-title">
      <span className="eyebrow">Two-step verification</span>
      <h1 id="mfa-title">{recovery ? "Use a recovery code." : "Enter your code."}</h1>
      <p className="muted">
        {recovery
          ? "Each recovery code works once."
          : "Open your authenticator app and enter the 6 digit code for SwiftDrop."}
      </p>
      <label htmlFor="mfa-value">{recovery ? "Recovery code" : "6 digit code"}</label>
      <input
        id="mfa-value"
        name="mfa-value"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoComplete="one-time-code"
        inputMode={recovery ? "text" : "numeric"}
        maxLength={recovery ? 14 : 6}
        autoFocus
        required
        aria-invalid={Boolean(error)}
        aria-describedby="mfa-status"
      />
      <p
        id="mfa-status"
        role={error ? "alert" : "status"}
        aria-live="polite"
        className={error ? "notice error" : undefined}
      >
        {error}
      </p>
      <button className="primary" disabled={pending}>
        {pending ? "Checking…" : "Verify and sign in"}
      </button>
      <p className="switch">
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setRecovery((previous) => !previous);
            setValue("");
            setError("");
          }}
        >
          {recovery ? "Use an authenticator code instead" : "Use a recovery code"}
        </button>
        {" · "}
        <button type="button" className="link-button" onClick={onCancel}>
          Start over
        </button>
      </p>
    </form>
  );
}

function RecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="notice success" role="status">
      <h3>Save your recovery codes</h3>
      <p>
        Each code works once if you lose your authenticator. They are shown
        only now, so store them somewhere safe.
      </p>
      <ol className="recovery-codes" aria-label="Recovery codes">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(codes.join("\n"))
            .then(() => setCopied(true))
            .catch(() => undefined);
        }}
      >
        {copied ? "Copied" : "Copy codes"}
      </button>{" "}
      <button type="button" className="primary" onClick={onDone}>
        I have saved these codes
      </button>
    </div>
  );
}

/** Enrol, replace recovery codes, or turn off the second factor (settings page). */
export function MfaSettings() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await getMfaStatus());
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  const start = () =>
    run(async () => {
      setSetup(await enrolMfa());
      setCode("");
      await load();
    });
  const confirm = (event: FormEvent) => {
    event.preventDefault();
    if (!mfaCodeSchema.safeParse(code.trim()).success) {
      setError("Enter the 6 digit code from your authenticator app.");
      return;
    }
    void run(async () => {
      setCodes((await confirmMfa(code.trim())).recoveryCodes);
      setSetup(null);
      setCode("");
      await load();
    });
  };
  const regenerate = () =>
    run(async () => {
      setCodes((await regenerateRecoveryCodes()).recoveryCodes);
      await load();
    });
  const turnOff = () => {
    if (!window.confirm("Turn off two-step verification?")) return;
    void run(async () => {
      await disableMfa();
      setCodes(null);
      await load();
    });
  };

  return (
    <section aria-labelledby="mfa-settings-title">
      <h2 id="mfa-settings-title">Two-step verification</h2>
      {status === null && !error && <p role="status">Loading…</p>}
      {status && !status.enabled && !setup && (
        <>
          <p className="muted">
            Add an authenticator app so a stolen password alone cannot sign in
            to your account.
            {status.required &&
              " Your role requires this before you can use staff features."}
          </p>
          <button type="button" className="primary" disabled={pending} onClick={() => void start()}>
            {pending ? "Starting…" : "Set up authenticator app"}
          </button>
        </>
      )}
      {setup && (
        <form onSubmit={confirm} noValidate>
          <p>
            In your authenticator app, add an account with this key (or{" "}
            <a href={setup.otpauthUri}>open it in an app on this device</a>),
            then enter the 6 digit code it shows.
          </p>
          <p>
            <code className="secret-key" aria-label="Setup key">
              {setup.secret.match(/.{1,4}/g)?.join(" ")}
            </code>
          </p>
          <label htmlFor="mfa-confirm-code">6 digit code</label>
          <input
            id="mfa-confirm-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
          />
          <button className="primary" disabled={pending}>
            {pending ? "Checking…" : "Turn on two-step verification"}
          </button>
        </form>
      )}
      {status?.enabled && (
        <>
          <p>
            <strong>On.</strong> {status.recoveryCodesRemaining} recovery{" "}
            {status.recoveryCodesRemaining === 1 ? "code" : "codes"} left.
          </p>
          <button type="button" className="secondary" disabled={pending} onClick={() => void regenerate()}>
            Get new recovery codes
          </button>{" "}
          <button
            type="button"
            className="secondary"
            disabled={pending || status.required}
            aria-describedby={status.required ? "mfa-required-note" : undefined}
            onClick={turnOff}
          >
            Turn off
          </button>
          {status.required && (
            <p id="mfa-required-note" className="muted">
              Your role requires two-step verification, so it cannot be turned off.
            </p>
          )}
        </>
      )}
      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}
      <p role="alert" aria-live="polite" className={error ? "notice error" : undefined}>
        {error}
      </p>
    </section>
  );
}
