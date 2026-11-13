import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthForm } from "./features/auth/forms.js";
import { roleHome, useSession } from "./features/auth/session.js";
import { VerifyEmail } from "./features/auth/verification.js";
import { AcceptInvite } from "./features/auth/accept-invite.js";
import {
  CompleteProfile,
  GoogleResult,
  SecuritySettings,
} from "./features/auth/google-pages.js";
import { AdminPricing, AdminZones } from "./features/pricing/index.js";
import { AdminReports } from "./features/reports/index.js";
import {
  NewParcel,
  ParcelDetail,
  ParcelList,
  PublicTracking,
} from "./features/parcels/pages.js";
import { AdminUsers, NewStaff } from "./features/users/pages.js";
import { AdminMerchants, MerchantSignup } from "./features/merchant/pages.js";
import { AdminWebhookDeliveries } from "./features/webhook-admin/pages.js";
import { Guard } from "./shared/auth/Guard.js";
import { Account } from "./shared/components/Account.js";

const APP_ROLES = [
  "CUSTOMER",
  "MERCHANT",
  "COURIER",
  "DISPATCHER",
  "ADMIN",
] as const;

export function AppRoutes() {
  const { state, clear, bootstrap } = useSession();
  const location = useLocation();

  // Public tracking route operates without session wrapper
  if (location.pathname.startsWith("/track/")) {
    return (
      <Routes>
        <Route path="/track/:trackingNumber" element={<PublicTracking />} />
      </Routes>
    );
  }

  // Session loading indicator
  if (state.status === "loading") {
    return (
      <div role="status" className="auth-panel">
        <h1>Restoring your session…</h1>
        <p>Just a moment.</p>
      </div>
    );
  }

  // Session connection error recovery
  if (state.status === "error") {
    return (
      <section className="auth-panel">
        <h1>Let’s reconnect.</h1>
        <p role="alert">{state.message}</p>
        <button type="button" className="primary" onClick={bootstrap}>
          Retry connection
        </button>
        <p>
          <Link to="/auth/login" onClick={clear}>
            Go to sign in
          </Link>
        </p>
      </section>
    );
  }

  return (
    <Routes>
      {/* Public Authentication Routes */}
      <Route path="/auth/login" element={<AuthForm />} />
      <Route path="/auth/register" element={<AuthForm registering />} />
      <Route path="/auth/merchant-register" element={<MerchantSignup />} />
      <Route path="/auth/verify-email" element={<VerifyEmail />} />
      <Route path="/auth/accept-invite" element={<AcceptInvite />} />
      <Route path="/auth/google/result" element={<GoogleResult />} />
      <Route path="/auth/complete-profile" element={<CompleteProfile />} />

      {/* Customer Routes */}
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

      {/* Admin Management Routes */}
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
        path="/admin/users/new"
        element={
          <Guard role="ADMIN">
            <NewStaff />
          </Guard>
        }
      />
      <Route
        path="/admin/webhooks"
        element={
          <Guard role="ADMIN">
            <AdminWebhookDeliveries />
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

      {/* Staff Operational Reports (Admin & Dispatcher) */}
      <Route
        path="/admin/reports"
        element={
          <Guard roles={["ADMIN", "DISPATCHER"]}>
            <AdminReports />
          </Guard>
        }
      />

      {/* Role Workspaces */}
      {APP_ROLES.map((role) => (
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

      {/* Default Navigation */}
      <Route
        path="/"
        element={
          <Navigate
            to={state.user ? roleHome(state.user.role) : "/auth/login"}
            replace
          />
        }
      />

      {/* 404 Catch-All */}
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
  );
}

