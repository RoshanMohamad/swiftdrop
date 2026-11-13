import { AppShell } from "./shared/layout/AppShell.js";
import { AppRoutes } from "./routes.js";

/**
 * Root Application Component
 * Encapsulates the AppShell layout and declarative AppRoutes.
 */
export function App() {
  return (
    <AppShell>
      <AppRoutes />
    </AppShell>
  );
}

