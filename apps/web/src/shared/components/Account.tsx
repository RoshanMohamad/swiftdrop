import { useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../features/auth/session.js";
import {
  ApiError,
  checkSession,
  errorMessage,
  resendVerification,
} from "../../features/auth/client.js";

export function Account() {
  const { state, clear } = useSession();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [resending, setResending] = useState(false);

  async function resend() {
    if (!state.user || resending) return;
    setResending(true);
    try {
      setNotice((await resendVerification(state.user.email)).message);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setResending(false);
    }
  }

  async function check() {
    setPending(true);
    setNotice("");
    try {
      await checkSession();
      setNotice("Your session is active.");
    } catch (error) {
      if (error instanceof ApiError && error.problem.status === 401) clear();
      else setNotice(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-panel account">
      <span className="eyebrow">Your workspace</span>
      <h1>Hello, {state.user?.fullName}.</h1>
      <p>
        You’re signed in as <strong>{state.user?.role.toLowerCase()}</strong>.
      </p>
      <dl>
        <dt>Email address</dt>
        <dd>{state.user?.email}</dd>
        <dt>Phone</dt>
        <dd>{state.user?.phone}</dd>
      </dl>
      {state.user?.role === "CUSTOMER" && (
        <div className="notice">
          Email status: {state.user.emailVerified ? "verified" : "not verified"}
          {!state.user.emailVerified && (
            <>
              <p>
                Verification helps confirm mailbox ownership. It does not block
                sign-in or account access.
              </p>
              <button
                className="secondary"
                disabled={resending}
                onClick={() => void resend()}
              >
                {resending ? "Sending…" : "Resend verification email"}
              </button>
            </>
          )}
        </div>
      )}
      {state.user?.role === "CUSTOMER" ? (
        <div className="notice account-links">
          <Link to="/parcels/new">Book a delivery</Link>
          <Link to="/parcels">Booking history</Link>
        </div>
      ) : state.user?.role === "MERCHANT" ? (
        <div className="notice account-links">
          <Link to="/merchant/clients">Manage API clients</Link>
          <Link to="/merchant/orders">Orders</Link>
          <Link to="/merchant/webhook">Webhook settings</Link>
        </div>
      ) : (
        <div className="notice">
          Your role is recognised. Operational and onboarding screens arrive in
          later phases.
        </div>
      )}
      {state.user?.role === "ADMIN" && (
        <div className="notice account-links">
          <Link to="/admin/users">Users</Link>
          <Link to="/admin/merchants">Merchant applications</Link>
          <Link to="/admin/zones">Service districts</Link>
          <Link to="/admin/pricing">Pricing</Link>
          <Link to="/admin/reports">Operations Reports</Link>
          <Link to="/admin/webhooks">Webhook deliveries</Link>
        </div>
      )}
      {state.user?.role === "DISPATCHER" && (
        <div className="notice account-links">
          <Link to="/admin/reports">Operations Reports</Link>
        </div>
      )}
      {state.user?.role === "CUSTOMER" && (
        <p>
          <Link to="/settings/security">Security settings · link Google</Link>
        </p>
      )}
      <button
        className="secondary"
        disabled={pending}
        onClick={() => void check()}
      >
        {pending ? "Checking…" : "Check session"}
      </button>
      <p role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}

