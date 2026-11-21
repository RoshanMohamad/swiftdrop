import { AppShell } from "./shared/layout/AppShell.js";
import { AppRoutes } from "./routes.js";
import { ErrorBoundary } from "./shared/components/ErrorBoundary.js";
import { ReauthDialog } from "./features/auth/reauth.js";

/**
 * Root Application Component
 * Encapsulates the AppShell layout, ErrorBoundary protection, and declarative AppRoutes.
 */
export function App() {
  return (
    <AppShell>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
      <ReauthDialog />
    </AppShell>
  );
}
