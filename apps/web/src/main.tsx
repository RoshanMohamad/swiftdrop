import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { SessionProvider } from "./features/auth/session.js";
import { App } from "./App.js";
import { startMocks } from "./mocks/index.js";
import "./styles.css";

async function bootstrap() {
  await startMocks();
  createRoot(document.getElementById("root")!).render(
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>,
  );
}

// Offline app shell for the courier PWA (production only; dev uses the MSW worker).
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });

void bootstrap();
