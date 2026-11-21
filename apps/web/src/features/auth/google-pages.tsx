import { useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { completeProfileSchema } from "@swiftdrop/contracts";
import { beginGoogleLink, completeProfile, errorMessage } from "./client.js";
import { roleHome, useSession } from "./session.js";
import { ActiveSessions, ChangePasswordForm, MfaSettings } from "./security.js";

export function CompleteProfile() {
  const { state, updateUser } = useSession();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!state.user) return <Navigate to="/auth/login" replace />;
  if (state.user.profileComplete)
    return <Navigate to={roleHome(state.user.role)} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const parsed = completeProfileSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] = issue.message;
      setErrors(next);
      form
        .querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)
        ?.focus();
      return;
    }
    setPending(true);
    setMessage("");
    try {
      updateUser(await completeProfile(parsed.data));
      setMessage("Your profile is complete.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="auth-panel" aria-labelledby="profile-title">
      <span className="eyebrow">One more step</span>
      <h1 id="profile-title">Complete your customer profile.</h1>
      <p className="muted">
        We need your name and Sri Lankan phone number before your account can
        use delivery features.
      </p>
      <form onSubmit={submit} noValidate aria-busy={pending}>
        <label htmlFor="fullName">Full name</label>
        <input
          id="fullName"
          name="fullName"
          autoComplete="name"
          defaultValue={state.user.fullName ?? ""}
          required
          maxLength={120}
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
        />
        {errors.fullName && (
          <small id="fullName-error" className="field-error">
            {errors.fullName}
          </small>
        )}
        <label htmlFor="phone">Sri Lankan phone number</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={state.user.phone ?? ""}
          required
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? "phone-error" : undefined}
        />
        {errors.phone && (
          <small id="phone-error" className="field-error">
            {errors.phone}
          </small>
        )}
        <p role="alert" aria-live="polite">
          {message}
        </p>
        <button className="primary" disabled={pending}>
          {pending ? "Saving…" : "Continue"}
        </button>
      </form>
    </section>
  );
}

export function GoogleResult() {
  const [params] = useSearchParams();
  const { state } = useSession();
  const status = params.get("status");
  if (status === "success" && state.user)
    return (
      <Navigate
        to={
          state.user.profileComplete
            ? roleHome(state.user.role)
            : "/auth/complete-profile"
        }
        replace
      />
    );
  const content =
    status === "linked"
      ? {
          title: "Google is linked.",
          body: "You can use Google or your password to sign in.",
        }
      : status === "account_exists"
        ? {
            title: "Use your existing account.",
            body: "That email already belongs to a SwiftDrop account. Sign in with your password, then link Google from Security settings.",
          }
        : status === "cancelled"
          ? {
              title: "Sign-in cancelled.",
              body: "You can try again whenever you’re ready.",
            }
          : {
              title: "Google sign-in failed.",
              body: "The sign-in could not be completed. Check your connection or try again.",
            };
  return (
    <section className="auth-panel">
      <span className="eyebrow">Google sign-in</span>
      <h1>{content.title}</h1>
      <p className="muted">{content.body}</p>
      <p>
        <Link to={state.user ? "/settings/security" : "/auth/login"}>
          {state.user ? "Back to security settings" : "Return to sign in"}
        </Link>
      </p>
    </section>
  );
}

export function SecuritySettings() {
  const { state } = useSession();
  const [reloadKey, setReloadKey] = useState(0);
  if (!state.user) return <Navigate to="/auth/login" replace />;
  return (
    <section className="auth-panel" aria-labelledby="security-title">
      <span className="eyebrow">Security settings</span>
      <h1 id="security-title">Your account security.</h1>
      <ChangePasswordForm onChanged={() => setReloadKey((key) => key + 1)} />
      <MfaSettings />
      <ActiveSessions reloadKey={reloadKey} />
      {state.user.role === "CUSTOMER" && <LinkGoogle />}
    </section>
  );
}

function LinkGoogle() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const formSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    setPending(true);
    setMessage("");
    try {
      const result = await beginGoogleLink(password);
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setMessage(errorMessage(error));
      setPending(false);
    }
  };
  return (
    <section aria-labelledby="link-google-title">
      <h2 id="link-google-title">Link Google</h2>
      <p className="muted">
        Prove your current password. The Google account must use the same email
        address.
      </p>
      <form onSubmit={formSubmit}>
        <label htmlFor="password">Current password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={72}
        />
        <p role="alert" aria-live="polite">
          {message}
        </p>
        <button className="primary" disabled={pending}>
          {pending ? "Opening Google…" : "Continue with Google"}
        </button>
      </form>
    </section>
  );
}
