import { Link, NavLink, useLocation } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { roleHome, useSession } from "../../features/auth/session.js";
import { logout } from "../../features/auth/client.js";
import { ChatWidget } from "../../features/assistant/index.js";
import { initials } from "../components/Profile.js";

export interface AppShellProps {
  children: ReactNode;
}

/** Public pages centre a narrow form; signed-in pages fill the panel as a workspace. */
function isPublicPath(pathname: string) {
  return pathname.startsWith("/auth/") || pathname.startsWith("/track/");
}

/** Decorative hero art: hills, a parcel box and the dashed route it travels. */
function HeroArt() {
  return (
    <svg
      className="hero-art"
      viewBox="0 0 480 300"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="hill-back"
        d="M0 220 C 90 180 200 196 300 214 S 430 206 480 188 V300 H0 Z"
      />
      <path
        className="hill-front"
        d="M0 252 C 120 222 270 270 480 232 V300 H0 Z"
      />
      <path className="route-path" d="M 182 188 C 240 110, 340 100, 430 128" />
      <circle className="route-end" cx="430" cy="128" r="7" />
      <ellipse className="box-shadow" cx="134" cy="264" rx="62" ry="8" />
      <polygon className="box-front" points="75,200 135,220 135,272 75,252" />
      <polygon className="box-side" points="135,220 190,200 190,252 135,272" />
      <polygon className="box-top" points="75,200 130,180 190,200 135,220" />
      <polygon
        className="box-tape"
        points="97.5,191.8 107.5,188.2 167.5,208.2 157.5,211.8"
      />
      <polygon
        className="box-tape"
        points="100,208.3 110,211.7 110,263.7 100,260.3"
      />
      <rect
        className="route-badge"
        x="285"
        y="94"
        width="44"
        height="44"
        rx="12"
      />
      <path
        className="route-badge-arrow"
        d="M300 124 L314 110 M303 110 L314 110 L314 121"
      />
    </svg>
  );
}

export function AppShell({ children }: AppShellProps) {
  const { state, clear } = useSession();
  const location = useLocation();
  const [logoutError, setLogoutError] = useState("");
  const [pending, setPending] = useState(false);
  const user = state.user;
  const workspace = Boolean(user) && !isPublicPath(location.pathname);
  // The hero illustration belongs to the sign-in page and each role's dashboard only.
  const showHero =
    location.pathname === "/auth/login" ||
    (Boolean(user) && location.pathname === roleHome(user!.role));

  async function handleSignOut(all = false) {
    setPending(true);
    setLogoutError("");
    try {
      await logout(all);
    } catch {
      setLogoutError(
        "Signed out on this screen. Server sign-out could not be confirmed. Retry to close this browser session.",
      );
    } finally {
      clear();
      setPending(false);
    }
  }

  const page = (
    <>
      {logoutError && (
        <div role="alert" className="notice error">
          {logoutError}
          <button
            type="button"
            disabled={pending}
            onClick={() => void handleSignOut()}
          >
            Retry sign-out
          </button>
        </div>
      )}
      {children}
    </>
  );

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header>
        <Link to="/" className="brand" aria-label="SwiftDrop home">
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
          SwiftDrop<span className="brand-dot">.</span>
        </Link>
        <span className="header-note">Made to move.</span>
        {user && (
          <nav aria-label="Main Navigation" className="role-nav">
            <NavLink to={roleHome(user.role)} end>
              Dashboard
            </NavLink>
            {user.role === "CUSTOMER" && (
              <>
                <NavLink to="/parcels" end>
                  Parcels
                </NavLink>
                <NavLink to="/parcels/new">Book Delivery</NavLink>
              </>
            )}
            {user.role === "ADMIN" && (
              <>
                <NavLink to="/admin/users">Users</NavLink>
                <NavLink to="/admin/merchants">Merchants</NavLink>
                <NavLink to="/admin/zones">Zones</NavLink>
                <NavLink to="/admin/pricing">Pricing</NavLink>
                <NavLink to="/admin/reports">Reports</NavLink>
              </>
            )}
            {user.role === "MERCHANT" && (
              <>
                <NavLink to="/merchant/orders">Orders</NavLink>
                <NavLink to="/merchant/clients">API clients</NavLink>
                <NavLink to="/merchant/webhook" end>
                  Webhook
                </NavLink>
                <NavLink to="/merchant/webhook-deliveries">Deliveries</NavLink>
              </>
            )}
            {user.role === "DISPATCHER" && (
              <NavLink to="/admin/reports">Reports</NavLink>
            )}
            <NavLink to="/settings/security">Security</NavLink>
          </nav>
        )}
        {user && (
          <nav aria-label="Account" className="account-nav">
            <NavLink
              to="/profile"
              className="profile-chip"
              title="Your profile"
            >
              <span className="avatar" aria-hidden="true">
                {initials(user.fullName, user.email)}
              </span>
              <span className="profile-chip-name">
                {user.fullName?.split(/\s+/)[0] ?? "Profile"}
              </span>
              <span className="visually-hidden">: your profile</span>
            </NavLink>
            <button
              type="button"
              disabled={pending}
              onClick={() => void handleSignOut()}
            >
              Sign out
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void handleSignOut(true)}
            >
              Sign out everywhere
            </button>
          </nav>
        )}
      </header>
      <main
        id="main"
        className={showHero ? "shell-split" : "shell-split no-hero"}
      >
        {showHero && (
          <aside className="intro" aria-label="Welcome and hero banner">
            <div className="intro-top">
              <span className="eyebrow">Across Sri Lanka</span>
              <p className="hero-title">
                A little closer.
                <br /> With every
                <br /> <span>delivery.</span>
              </p>
              <p className="intro-copy">
                The first step to sending something good.
              </p>
            </div>
            <HeroArt />
          </aside>
        )}
        <div
          className={workspace ? "stage" : "content"}
          key={location.pathname}
        >
          <div className={workspace ? "panel workspace" : "panel"}>{page}</div>
        </div>
      </main>
      <footer>
        <span>SwiftDrop · Sri Lanka</span>
        <span>Every delivery, a connection.</span>
      </footer>
      <ChatWidget />
    </div>
  );
}
