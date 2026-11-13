import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useState, type ReactNode } from "react";
import { AuthForm } from "./features/auth/forms.js";
import {
  SessionProvider,
  roleHome,
  useSession,
} from "./features/auth/session.js";
import {
  ApiError,
  checkSession,
  errorMessage,
  logout,
  resendVerification,
} from "./features/auth/client.js";
import { VerifyEmail } from "./features/auth/verification.js";
import { AcceptInvite } from "./features/auth/accept-invite.js";
import {
  CompleteProfile,
  GoogleResult,
  SecuritySettings,
} from "./features/auth/google-pages.js";
import type { Role } from "@swiftdrop/contracts";
import { AdminPricing, AdminZones } from "./features/pricing/index.js";
import { AdminReports } from "./features/reports/index.js";
import { ChatWidget } from "./features/assistant/index.js";
import {
  NewParcel,
  ParcelDetail,
  ParcelList,
  PublicTracking,
} from "./features/parcels/pages.js";
import { AdminUsers, NewStaff } from "./features/users/pages.js";
import {
  AdminMerchants,
  MerchantClients,
  MerchantWebhookSettings,
  MerchantOrders,
  MerchantSignup,
} from "./features/merchant/pages.js";
import "./styles.css";
function Guard({
  role,
  roles,
  children,
}: {
  role?: Role;
  roles?: Role[];
  children: ReactNode;
}) {
  const { state } = useSession();
  if (!state.user) return <Navigate to="/auth/login" replace />;
  if (!state.user.profileComplete)
    return <Navigate to="/auth/complete-profile" replace />;
  const allowed = roles
    ? roles.includes(state.user.role)
    : state.user.role === role;
  if (!allowed) return <Navigate to={roleHome(state.user.role)} replace />;
  return children;
}
function Account() {
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
function App() {
  const { state, clear, bootstrap } = useSession();
  const location = useLocation();
  const [logoutError, setLogoutError] = useState("");
  const [pending, setPending] = useState(false);
  async function signOut(all = false) {
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
          <nav aria-label="Account">
            <button disabled={pending} onClick={() => void signOut()}>
              Sign out
            </button>
            <button disabled={pending} onClick={() => void signOut(true)}>
              Sign out everywhere
            </button>
          </nav>
        )}
      </header>
      <main id="main">
        <aside className="intro">
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
              <button disabled={pending} onClick={() => void signOut()}>
                Retry sign-out
              </button>
            </div>
          )}
          {location.pathname.startsWith("/track/") ? (
            <Routes>
              <Route
                path="/track/:trackingNumber"
                element={<PublicTracking />}
              />
            </Routes>
          ) : state.status === "loading" ? (
            <div role="status" className="auth-panel">
              <h1>Restoring your session…</h1>
              <p>Just a moment.</p>
            </div>
          ) : state.status === "error" ? (
            <section className="auth-panel">
              <h1>Let’s reconnect.</h1>
              <p role="alert">{state.message}</p>
              <button className="primary" onClick={bootstrap}>
                Retry connection
              </button>
              <p>
                <Link to="/auth/login" onClick={clear}>
                  Go to sign in
                </Link>
              </p>
            </section>
          ) : (
            <Routes>
              <Route path="/auth/login" element={<AuthForm />} />
              <Route path="/auth/register" element={<AuthForm registering />} />
              <Route
                path="/auth/merchant-register"
                element={<MerchantSignup />}
              />
              <Route path="/auth/verify-email" element={<VerifyEmail />} />
              <Route path="/auth/accept-invite" element={<AcceptInvite />} />
              <Route path="/auth/google/result" element={<GoogleResult />} />
              <Route
                path="/auth/complete-profile"
                element={<CompleteProfile />}
              />
              <Route path="/settings/security" element={<SecuritySettings />} />
              <Route
                path="/parcels/new"
                element={
                  <Guard role="CUSTOMER">
                    <NewParcel />
                  </Guard>
                }
              />
              <Route
                path="/parcels"
                element={
                  <Guard role="CUSTOMER">
                    <ParcelList />
                  </Guard>
                }
              />
              <Route
                path="/parcels/:id"
                element={
                  <Guard role="CUSTOMER">
                    <ParcelDetail />
                  </Guard>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <Guard role="ADMIN">
                    <AdminUsers />
                  </Guard>
                }
              />
              <Route
                path="/admin/merchants"
                element={
                  <Guard role="ADMIN">
                    <AdminMerchants />
                  </Guard>
                }
              />
              <Route
                path="/merchant/clients"
                element={
                  <Guard role="MERCHANT">
                    <MerchantClients />
                  </Guard>
                }
              />
              <Route
                path="/merchant/orders"
                element={
                  <Guard role="MERCHANT">
                    <MerchantOrders />
                  </Guard>
                }
              />
              <Route
                path="/merchant/webhook"
                element={
                  <Guard role="MERCHANT">
                    <MerchantWebhookSettings />
                  </Guard>
                }
              />
              <Route
                path="/admin/users/new"
                element={
                  <Guard role="ADMIN">
                    <NewStaff />
                  </Guard>
                }
              />
              <Route
                path="/admin/zones"
                element={
                  <Guard role="ADMIN">
                    <AdminZones />
                  </Guard>
                }
              />
              <Route
                path="/admin/pricing"
                element={
                  <Guard role="ADMIN">
                    <AdminPricing />
                  </Guard>
                }
              />
              <Route
                path="/admin/reports"
                element={
                  <Guard roles={["ADMIN", "DISPATCHER"]}>
                    <AdminReports />
                  </Guard>
                }
              />
              {(
                [
                  "CUSTOMER",
                  "MERCHANT",
                  "COURIER",
                  "DISPATCHER",
                  "ADMIN",
                ] as const
              ).map((role) => (
                <Route
                  key={role}
                  path={roleHome(role)}
                  element={
                    <Guard role={role}>
                      <Account />
                    </Guard>
                  }
                />
              ))}
              <Route
                path="/"
                element={
                  <Navigate
                    to={state.user ? roleHome(state.user.role) : "/auth/login"}
                    replace
                  />
                }
              />
              <Route
                path="*"
                element={
                  <section className="auth-panel">
                    <h1>Page not found.</h1>
                    <Link to="/">Back to SwiftDrop</Link>
                  </section>
                }
              />
            </Routes>
          )}
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
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <SessionProvider>
      <App />
    </SessionProvider>
  </BrowserRouter>,
);
