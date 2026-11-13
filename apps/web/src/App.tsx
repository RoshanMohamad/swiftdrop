import { AppShell } from "./shared/layout/AppShell.js";
import { AppRoutes } from "./routes.js";
import { ErrorBoundary } from "./shared/components/ErrorBoundary.js";

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
    </AppShell>
  );
}
