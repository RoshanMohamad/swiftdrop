/**
 * MSW browser service-worker setup.
 *
 * Import `worker` only from the mock-mode entry point (`src/mocks/index.ts`).
 * Never import this in production code.
 */

import { setupWorker } from "msw/browser";
import { handlers } from "./handlers.js";

export const worker = setupWorker(...handlers);
