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
import { initials } from "./Profile.js";

type Role = "CUSTOMER" | "MERCHANT" | "COURIER" | "DISPATCHER" | "ADMIN";
interface Tile {
  to: string;
  title: string;
  icon: IconName;
  desc?: string;
}

const TILES: Partial<Record<Role, Tile[]>> = {
  CUSTOMER: [
    {
      to: "/parcels/new",
      title: "Book a delivery",
      icon: "box",
      desc: "Create a new delivery request in a few steps.",
    },
    {
      to: "/parcels",
      title: "Booking history",
      icon: "list",
      desc: "View and track all your deliveries.",
    },
  ],
  MERCHANT: [
    {
      to: "/merchant/orders",
      title: "Orders",
      icon: "box",
      desc: "Review and track your merchant orders.",
    },
    {
      to: "/merchant/clients",
      title: "Manage API clients",
      icon: "key",
      desc: "Create and rotate API credentials.",
    },
    {
      to: "/merchant/webhook",
      title: "Webhook settings",
      icon: "webhook",
      desc: "Set your endpoint and signing secret.",
    },
    {
      to: "/merchant/webhook-deliveries",
      title: "Webhook delivery history",
      icon: "link",
      desc: "See every delivery attempt and its result.",
    },
  ],
  ADMIN: [
    {
      to: "/admin/users",
      title: "Users",
      icon: "users",
      desc: "Manage accounts, roles and access.",
    },
    {
      to: "/admin/merchants",
      title: "Merchant applications",
      icon: "store",
      desc: "Review and approve new merchants.",
    },
    {
      to: "/admin/zones",
      title: "Service districts",
      icon: "pin",
      desc: "Manage delivery zones.",
    },
    {
      to: "/admin/pricing",
      title: "Pricing",
      icon: "tag",
      desc: "Edit fees by zone and size.",
    },
    {
      to: "/admin/reports",
      title: "Operations Reports",
      icon: "chart",
      desc: "Volumes, delivery rates and KPIs.",
    },
    {
      to: "/admin/webhooks",
      title: "Webhook deliveries",
      icon: "link",
      desc: "Monitor and replay failed webhooks.",
    },
  ],
  DISPATCHER: [
    {
      to: "/admin/reports",
      title: "Operations Reports",
      icon: "chart",
      desc: "Volumes, delivery rates and KPIs.",
    },
  ],
};

/** Decorative delivery-van scene for the customer dashboard. */
function DashArt() {
  return (
    <svg
      className="dash-art"
      viewBox="0 0 480 420"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="da-hill"
        d="M0 330 C 110 270 250 340 480 280 V420 H0 Z"
      />
      <path
        className="da-hill2"
        d="M0 372 C 140 340 300 392 480 350 V420 H0 Z"
      />
      <g className="da-city">
        <rect x="250" y="150" width="34" height="120" rx="3" />
        <rect x="292" y="190" width="40" height="80" rx="3" />
        <rect x="378" y="130" width="40" height="140" rx="3" />
      </g>
      <path
        className="da-route"
        d="M70 250 C 60 150 180 90 270 110 S 400 150 392 168"
      />
      <circle className="da-dot" cx="392" cy="172" r="7" />
      <path
        className="da-pin"
        d="M118 90c-20 0-34 15-34 33 0 24 34 58 34 58s34-34 34-58c0-18-14-33-34-33Z"
      />
      <circle cx="118" cy="122" r="12" fill="#fff" />
      <ellipse className="da-shadow" cx="300" cy="338" rx="160" ry="14" />
      <path
        className="da-van"
        d="M150 300 V232 q0-14 14-18 l52-14 q10-18 28-18 h120 q24 0 24 24 V300 Z"
      />
      <path className="da-window" d="M226 204 q6-14 20-14 h22 v50 h-58 Z" />
      <rect className="da-stripe" x="150" y="270" width="214" height="8" />
      <rect className="da-logo" x="300" y="222" width="26" height="26" rx="7" />
      <path className="da-logo-arrow" d="M308 242 L318 232 M310 232 h8 v8" />
      <circle className="da-wheel" cx="208" cy="304" r="24" />
      <circle className="da-wheel" cx="336" cy="304" r="24" />
      <circle className="da-hub" cx="208" cy="304" r="10" />
      <circle className="da-hub" cx="336" cy="304" r="10" />
      <polygon className="da-box-f" points="92,310 132,322 132,362 92,350" />
      <polygon className="da-box-s" points="132,322 168,308 168,348 132,362" />
      <polygon className="da-box-t" points="92,310 128,296 168,308 132,322" />
    </svg>
  );
}

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

  const customer = user?.role === "CUSTOMER";

  return (
    <section className="account dash dash-customer">
      <div className="dash-main">
        <div className="dash-hero">
          <span className="eyebrow">Your workspace</span>
          <h1>Hello, {user?.fullName}.</h1>
          <p>
            You’re signed in as{" "}
            <strong className="role-pill">{user?.role.toLowerCase()}</strong>.
          </p>
        </div>

        <section className="dash-profile" aria-label="Your profile">
          {
            <div className="dash-avatar" aria-hidden="true">
              {initials(user?.fullName, user?.email)}
              {user?.emailVerified && (
                <span className="dash-avatar-check">
                  <Icon name="check-circle" />
                </span>
              )}
            </div>
          }
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
              user.emailVerified
                ? "dash-notice"
                : "dash-notice dash-notice-warn"
            }
          >
            <Icon name={user.emailVerified ? "check-circle" : "info"} />
            <div>
              Email status:{" "}
              <strong>
                {user.emailVerified ? "Verified" : "Not verified"}
              </strong>
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
                {tile.desc ? (
                  <span className="dash-tile-text">
                    <strong>{tile.title}</strong>
                    <small>{tile.desc}</small>
                  </span>
                ) : (
                  tile.title
                )}
                {tile.desc && (
                  <span className="dash-tile-go">
                    <Icon name="arrow-right" />
                  </span>
                )}
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
          <Link to="/profile" className="dash-link">
            <Icon name="user" />
            Edit profile
          </Link>
          <Link to="/settings/security" className="dash-link">
            <Icon name="shield" />
            Security settings
          </Link>
        </div>
        <p role="status" aria-live="polite" className="dash-status">
          {notice}
        </p>
      </div>
      <DashArt />
    </section>
  );
}
