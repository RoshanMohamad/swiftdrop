import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { updateProfileSchema } from "@swiftdrop/contracts";
import { errorMessage, updateProfile } from "../../features/auth/client.js";
import { useSession } from "../../features/auth/session.js";
import { Icon } from "./Icon.js";

const ROLE_LABEL = {
  CUSTOMER: "Customer",
  MERCHANT: "Merchant",
  COURIER: "Courier",
  DISPATCHER: "Dispatcher",
  ADMIN: "Admin",
} as const;

/** Up to two initials from the name, or the email, for the avatar. */
export function initials(name: string | null | undefined, email = "") {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? `${words[0]![0]}${words[words.length - 1]![0]}`
      : (words[0]?.slice(0, 2) ?? email.slice(0, 2));
  return letters.toUpperCase() || "?";
}

/** Your own profile, for every role: view details, edit name and phone. */
export function Profile() {
  const { state, updateUser } = useSession();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const user = state.user;
  if (!user) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const parsed = updateProfileSchema.safeParse(
      Object.fromEntries(new FormData(form)),
    );
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        next[String(issue.path[0] ?? "fullName")] ??= issue.message;
      setErrors(next);
      form
        .querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)
        ?.focus();
      return;
    }
    setErrors({});
    setPending(true);
    setMessage("");
    try {
      updateUser(await updateProfile(parsed.data));
      setEditing(false);
      setMessage("Your profile is saved.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="profile-page" aria-labelledby="profile-title">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Your account</span>
          <h1 id="profile-title">
            <span className="title-icon">
              <Icon name="user" />
            </span>
            Your profile.
          </h1>
          <p className="muted">
            How SwiftDrop knows you. Couriers and recipients see your name and
            phone on deliveries.
          </p>
        </div>
      </header>

      <div className="profile-identity">
        <span className="avatar avatar-lg" aria-hidden="true">
          {initials(user.fullName, user.email)}
        </span>
        <div>
          <p className="profile-name">{user.fullName ?? "Name not set"}</p>
          <p className="profile-meta">
            <span className="role-pill">{ROLE_LABEL[user.role]}</span>
            {user.email}
          </p>
        </div>
      </div>

      <p role="status" aria-live="polite" className="profile-status">
        {message}
      </p>

      {editing ? (
        <form
          className="form-card"
          onSubmit={submit}
          noValidate
          aria-busy={pending}
          aria-labelledby="edit-profile-title"
        >
          <h2 id="edit-profile-title">Edit details</h2>
          <p className="fine">
            Your email address can’t be changed here, because it needs to be
            verified again.
          </p>
          <div className="form-rows">
            <div className="field">
              <label htmlFor="fullName">
                <Icon name="user" />
                Full name
              </label>
              <input
                id="fullName"
                name="fullName"
                autoComplete="name"
                defaultValue={user.fullName ?? ""}
                required
                maxLength={120}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={
                  errors.fullName ? "fullName-error" : undefined
                }
              />
              {errors.fullName && (
                <small id="fullName-error" className="field-error">
                  {errors.fullName}
                </small>
              )}
            </div>
            <div className="field">
              <label htmlFor="phone">
                <Icon name="phone" />
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                defaultValue={user.phone ?? ""}
                required
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
              />
              {errors.phone ? (
                <small id="phone-error" className="field-error">
                  {errors.phone}
                </small>
              ) : (
                <small id="phone-hint">
                  Sri Lankan number, e.g. 077 123 4567.
                </small>
              )}
            </div>
          </div>
          <div className="profile-actions">
            <button className="primary" disabled={pending}>
              <Icon name="check-circle" />
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setErrors({});
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <section className="dash-profile" aria-label="Your details">
          <dl>
            <div>
              <dt>
                <span className="dash-profile-icon">
                  <Icon name="user" />
                </span>
                Full name
              </dt>
              <dd>{user.fullName ?? "Not set"}</dd>
            </div>
            <div>
              <dt>
                <span className="dash-profile-icon">
                  <Icon name="mail" />
                </span>
                Email address
              </dt>
              <dd>
                {user.email}{" "}
                <span
                  className={
                    user.emailVerified ? "verify-pill verified" : "verify-pill"
                  }
                >
                  {user.emailVerified ? "Verified" : "Not verified"}
                </span>
              </dd>
            </div>
            <div>
              <dt>
                <span className="dash-profile-icon">
                  <Icon name="phone" />
                </span>
                Phone
              </dt>
              <dd>{user.phone ?? "Not set"}</dd>
            </div>
            <div>
              <dt>
                <span className="dash-profile-icon">
                  <Icon name="shield" />
                </span>
                Role
              </dt>
              <dd>{ROLE_LABEL[user.role]}</dd>
            </div>
          </dl>
          <div className="profile-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                setMessage("");
                setEditing(true);
              }}
            >
              Edit profile
            </button>
            <Link to="/settings/security" className="dash-link">
              <Icon name="lock" />
              Password and security
            </Link>
          </div>
        </section>
      )}
    </section>
  );
}
