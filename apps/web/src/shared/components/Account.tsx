import { useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../features/auth/session.js";
import {
  ApiError,
  checkSession,
  errorMessage,
  resendVerification,
} from "../../features/auth/client.js";
import { Icon, type IconName } from "./Icon.js";

type Role = "CUSTOMER" | "MERCHANT" | "COURIER" | "DISPATCHER" | "ADMIN";
interface Tile {
  to: string;
  title: string;
  icon: IconName;
}

const TILES: Partial<Record<Role, Tile[]>> = {
  CUSTOMER: [
    { to: "/parcels/new", title: "Book a delivery", icon: "box" },
    { to: "/parcels", title: "Booking history", icon: "list" },
  ],
  MERCHANT: [
    { to: "/merchant/orders", title: "Orders", icon: "box" },
    { to: "/merchant/clients", title: "Manage API clients", icon: "key" },
    { to: "/merchant/webhook", title: "Webhook settings", icon: "webhook" },
    {
      to: "/merchant/webhook-deliveries",
      title: "Webhook delivery history",
      icon: "link",
    },
  ],
  ADMIN: [
    { to: "/admin/users", title: "Users", icon: "users" },
    {
      to: "/admin/merchants",
      title: "Merchant applications",
      icon: "store",
    },
    { to: "/admin/zones", title: "Service districts", icon: "pin" },
    { to: "/admin/pricing", title: "Pricing", icon: "tag" },
    { to: "/admin/reports", title: "Operations Reports", icon: "chart" },
    { to: "/admin/webhooks", title: "Webhook deliveries", icon: "link" },
  ],
  DISPATCHER: [
    { to: "/admin/reports", title: "Operations Reports", icon: "chart" },
  ],
};

export function Account() {
  const { state, clear } = useSession();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [resending, setResending] = useState(false);
  const user = state.user;
  const tiles = (user && TILES[user.role as Role]) ?? [];

  async function resend() {
    if (!user || resending) return;
    setResending(true);
    try {
      setNotice((await resendVerification(user.email)).message);
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
    <section className="account dash">
      <div className="dash-hero">
        <span className="eyebrow">Your workspace</span>
        <h1>Hello, {user?.fullName}.</h1>
        <p>
          You’re signed in as <strong>{user?.role.toLowerCase()}</strong>.
        </p>
      </div>

      <section className="dash-profile" aria-label="Your profile">
        <dl>
          <div>
            <dt>
              <span className="dash-profile-icon">
                <Icon name="mail" />
              </span>
              Email address
            </dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt>
              <span className="dash-profile-icon">
                <Icon name="phone" />
              </span>
              Phone
            </dt>
            <dd>{user?.phone}</dd>
          </div>
        </dl>
      </section>

      {user?.role === "CUSTOMER" ? (
        <div
          className={
            user.emailVerified ? "dash-notice" : "dash-notice dash-notice-warn"
          }
        >
          <Icon name={user.emailVerified ? "check-circle" : "info"} />
          <div>
            Email status: {user.emailVerified ? "verified" : "not verified"}
            {!user.emailVerified && (
              <>
                <p>
                  Verification helps confirm mailbox ownership. It does not
                  block sign-in or account access.
                </p>
                <button
                  className="secondary compact"
                  disabled={resending}
                  onClick={() => void resend()}
                >
                  {resending ? "Sending…" : "Resend verification email"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="dash-notice">
          <Icon name="info" />
          <div>
            {tiles.length > 0
              ? "Your role is recognised. Pick a task below to get started."
              : "Your role is recognised. Operational and onboarding screens arrive in later phases."}
          </div>
        </div>
      )}

      {tiles.length > 0 && (
        <nav aria-label="Quick actions" className="dash-grid">
          {tiles.map((tile) => (
            <Link key={tile.to} to={tile.to} className="dash-tile">
              <span className="dash-tile-icon">
                <Icon name={tile.icon} />
              </span>
              {tile.title}
            </Link>
          ))}
        </nav>
      )}

      <div className="dash-footer">
        <button
          className="secondary compact"
          disabled={pending}
          onClick={() => void check()}
        >
          <Icon name="refresh" />
          {pending ? "Checking…" : "Check session"}
        </button>
        <Link to="/settings/security" className="dash-link">
          <Icon name="shield" />
          Security settings
        </Link>
      </div>
      <p role="status" aria-live="polite" className="dash-status">
        {notice}
      </p>
    </section>
  );
}
