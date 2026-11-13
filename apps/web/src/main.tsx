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

void bootstrap();
