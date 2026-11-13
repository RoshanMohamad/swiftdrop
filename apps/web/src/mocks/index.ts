/**
 * MSW mock-mode entry point.
 *
 * Conditionally starts the Service Worker mock when the app is built in
 * `mock` mode (VITE_MOCK=true). In all other modes this module does nothing.
 *
 * Usage: Vite `--mode mock` sets `import.meta.env.MODE === "mock"`.
 * The script `pnpm --filter web dev:mock` starts the dev server in that mode.
 */

export async function startMocks(): Promise<void> {
  if (import.meta.env.MODE !== "mock") return;

  const { worker } = await import("./browser.js");

  await worker.start({
    onUnhandledFrame: "warn",
    serviceWorker: {
      url: "/mockServiceWorker.js",
    },
  });
}
