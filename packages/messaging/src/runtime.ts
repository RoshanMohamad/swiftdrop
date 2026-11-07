import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { config as dotenv } from "dotenv";
import pino, { type Logger } from "pino";

/** Load the workspace `.env` regardless of which app directory the process starts in. */
export function loadWorkspaceEnv() {
  let root = process.cwd();
  while (!existsSync(resolve(root, "pnpm-workspace.yaml"))) {
    const parent = dirname(root);
    if (parent === root) return process.env;
    root = parent;
  }
  dotenv({ path: resolve(root, ".env"), quiet: true });
  return process.env;
}

/** Same redaction list as core-api so logs stay privacy-safe across services (NFR-4). */
export function createLogger(service: string): Logger {
  return pino({
    base: { service },
    redact: {
      paths: [
        "password",
        "*.password",
        "authorization",
        "*.authorization",
        "cookie",
        "*.cookie",
        "token",
        "*.token",
        "secret",
        "*.secret",
        "email",
        "*.email",
        "phone",
        "*.phone",
        "address",
        "*.address",
      ],
      censor: "[REDACTED]",
    },
  });
}

/** `/healthz` = process alive; `/readyz` = dependencies usable (NFR-10). */
export function startHealthServer(options: {
  port: number;
  ready: () => boolean | Promise<boolean>;
  host?: string;
}): Promise<Server> {
  const server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "GET")
      return send(405, { status: "method not allowed" });
    if (req.url === "/healthz") return send(200, { status: "ok" });
    if (req.url === "/readyz")
      return void Promise.resolve(options.ready())
        .then((ready) =>
          send(ready ? 200 : 503, { status: ready ? "ready" : "not ready" }),
        )
        .catch(() => send(503, { status: "not ready" }));
    send(404, { status: "not found" });
  });
  return new Promise((resolveStart, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host ?? "127.0.0.1", () =>
      resolveStart(server),
    );
  });
}

/** Run `stop` once on SIGINT/SIGTERM; force-exit if it hangs so containers do not linger. */
export function onShutdown(stop: () => Promise<void>, logger: Logger) {
  let stopping = false;
  const handle = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ event: "shutdown", signal });
    const timer = setTimeout(() => process.exit(1), 10_000);
    timer.unref();
    stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on("SIGINT", () => handle("SIGINT"));
  process.on("SIGTERM", () => handle("SIGTERM"));
}
