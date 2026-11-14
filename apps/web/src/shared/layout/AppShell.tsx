import { Link, useLocation } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { roleHome, useSession } from "../../features/auth/session.js";
import { logout } from "../../features/auth/client.js";
import { ChatWidget } from "../../features/assistant/index.js";

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { state, clear } = useSession();
  const location = useLocation();
  const [logoutError, setLogoutError] = useState("");
  const [pending, setPending] = useState(false);

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
        {state.user && (
          <nav aria-label="Main Navigation" className="role-nav">
            <Link to={roleHome(state.user.role)}>Dashboard</Link>
            {state.user.role === "CUSTOMER" && (
              <>
                <Link to="/parcels">Parcels</Link>
                <Link to="/parcels/new">Book Delivery</Link>
              </>
            )}
            {state.user.role === "ADMIN" && (
              <>
                <Link to="/admin/users">Users</Link>
                <Link to="/admin/merchants">Merchants</Link>
                <Link to="/admin/zones">Zones</Link>
                <Link to="/admin/pricing">Pricing</Link>
                <Link to="/admin/reports">Reports</Link>
              </>
            )}
            {state.user.role === "DISPATCHER" && (
              <Link to="/admin/reports">Reports</Link>
            )}
            <Link to="/settings/security">Security</Link>
          </nav>
        )}
        {state.user && (
          <nav aria-label="Account">
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
      <main id="main">
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
          <div className="route-art" aria-hidden="true">
            <span className="route-start">Colombo</span>
            <div className="route-line">
              <i>↗</i>
            </div>
            <span className="route-end">Kandy</span>
          </div>
          <p className="intro-foot">Your next delivery starts here.</p>
        </aside>
        <div className="content" key={location.pathname}>
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

