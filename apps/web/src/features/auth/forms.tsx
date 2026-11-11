import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { loginSchema, registrationSchema } from "@swiftdrop/contracts";
import {
  ApiError,
  errorMessage,
  googleProviders,
  login,
  register,
  resendVerification,
} from "./client.js";
import { roleHome, useSession } from "./session.js";
export function AuthForm({ registering = false }: { registering?: boolean }) {
  const { state, accept } = useSession();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [visible, setVisible] = useState(false);
  const [resending, setResending] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [googleChecked, setGoogleChecked] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  useEffect(
    () => () => {
      form.current?.reset();
    },
    [],
  );
  useEffect(() => {
    if (!registering)
      void googleProviders()
        .then((providers) => setGoogleAvailable(providers.google))
        .catch(() => setGoogleAvailable(false))
        .finally(() => setGoogleChecked(true));
  }, [registering]);
  if (state.status === "authenticated" && state.user)
    return <Navigate to={roleHome(state.user.role)} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const element = event.currentTarget;
    const values = Object.fromEntries(new FormData(element));
    const input = registering
      ? {
          fullName: values.fullName,
          email: values.email,
          phone: values.phone,
          password: values.password,
        }
      : { email: values.email, password: values.password };
    const parsed = (registering ? registrationSchema : loginSchema).safeParse(
      input,
    );
    const fields: Record<string, string[]> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        (fields[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
    if (registering && values.password !== values.confirm)
      fields.confirm = ["Passwords do not match."];
    setErrors(fields);
    setMessage("");
    if (Object.keys(fields).length) {
      setMessage("Check the highlighted fields.");
      element
        .querySelector<HTMLElement>(`[name="${Object.keys(fields)[0]}"]`)
        ?.focus();
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      if (registering) {
        const response = await register(registrationSchema.parse(input));
        setSuccess(true);
        setMessage(response.message);
        element.reset();
      } else
        accept(
          await login(
            String(values.email).trim().toLowerCase(),
            String(values.password),
          ),
        );
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiError && error.problem.errors)
        setErrors(error.problem.errors);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  async function resend() {
    if (!form.current || resending) return;
    const email = String(new FormData(form.current).get("email") ?? "")
      .trim()
      .toLowerCase();
    if (!email) {
      setMessage("Enter your email address first.");
      form.current.querySelector<HTMLInputElement>("[name=email]")?.focus();
      return;
    }
    setResending(true);
    setMessage("");
    try {
      setMessage((await resendVerification(email)).message);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setResending(false);
    }
  }
  const field = (
    name: string,
    label: string,
    type: string,
    autocomplete: string,
    hint?: string,
  ) => (
    <div className="field" key={name}>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autocomplete}
        required
        aria-invalid={Boolean(errors[name])}
        aria-describedby={
          [hint ? `${name}-hint` : "", errors[name] ? `${name}-error` : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
        maxLength={
          name === "password" || name === "confirm"
            ? undefined
            : name === "fullName"
              ? 120
              : name === "email"
                ? 254
                : 16
        }
      />
      {hint && <small id={`${name}-hint`}>{hint}</small>}
      {errors[name] && (
        <small className="field-error" id={`${name}-error`}>
          {errors[name].join(" ")}
        </small>
      )}
    </div>
  );
  return (
    <section className="auth-panel" aria-labelledby="form-title">
      <span className="eyebrow">
        {registering ? "Start with SwiftDrop" : "Welcome back"}
      </span>
      <h1 id="form-title">
        {registering ? "Create your account" : "A good day to deliver."}
      </h1>
      <p className="muted">
        {registering
          ? "One account for your next delivery. Email verification is optional and does not block sign-in."
          : "Sign in to your SwiftDrop account."}
      </p>
      <form ref={form} onSubmit={submit} noValidate aria-busy={pending}>
        {registering && field("fullName", "Full name", "text", "name")}
        {field("email", "Email address", "email", "email")}
        {registering &&
          field(
            "phone",
            "Sri Lankan phone number",
            "tel",
            "tel",
            "For example, 0771234567 or +94771234567.",
          )}
        {field(
          "password",
          "Password",
          visible ? "text" : "password",
          registering ? "new-password" : "current-password",
          registering
            ? "At least 15 characters; at most 72 UTF-8 bytes. Spaces and paste are welcome."
            : undefined,
        )}
        <button
          className="text-button reveal"
          type="button"
          onClick={() => setVisible(!visible)}
          aria-pressed={visible}
        >
          {visible ? "Hide password" : "Show password"}
        </button>
        {registering &&
          field(
            "confirm",
            "Confirm password",
            visible ? "text" : "password",
            "new-password",
          )}
        <div
          role={success ? "status" : "alert"}
          className={message ? `notice ${success ? "success" : "error"}` : ""}
          aria-live="polite"
        >
          {message}
          {errors.form && ` ${errors.form.join(" ")}`}
        </div>
        <button className="primary" type="submit" disabled={pending}>
          {pending
            ? "Please wait…"
            : registering
              ? "Create account"
              : "Sign in"}
          <span aria-hidden="true"> →</span>
        </button>
        {!registering && (
          <button
            className="text-button"
            type="button"
            disabled={resending || pending}
            onClick={() => void resend()}
          >
            {resending ? "Sending…" : "Resend verification email"}
          </button>
        )}
      </form>
      {!registering && (
        <>
          <div className="separator">
            <span>or</span>
          </div>
          <button
            className="provider"
            type="button"
            disabled={!googleChecked || !googleAvailable}
            aria-describedby="google-note"
            onClick={() => window.location.assign("/api/v1/auth/google")}
          >
            Continue with Google
          </button>
          <p className="fine" id="google-note">
            {googleAvailable
              ? "Sign in or create a customer account with Google."
              : "Google sign-in is unavailable. Use your email and password."}
          </p>
          <p className="fine">
            Password recovery is planned for a later phase.
          </p>
        </>
      )}
      <p className="switch">
        {registering ? (
          <>
            Already have an account? <Link to="/auth/login">Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link to="/auth/register">Create an account</Link>
          </>
        )}
      </p>
      {success && (
        <Link className="inline-link" to="/auth/login">
          Continue to sign in →
        </Link>
      )}
      {registering && (
        <p className="fine">
          Registering a business?{" "}
          <Link to="/auth/merchant-register">Apply for a merchant account</Link>
          .
        </p>
      )}
    </section>
  );
}
