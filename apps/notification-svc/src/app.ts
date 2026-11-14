import { createServer, type Server } from "node:http";
import { Prisma, type Database } from "@swiftdrop/db";
import type { Logger } from "pino";
import type { EventConsumer } from "./types.js";

type RuntimeDatabase = Pick<Database, "$queryRaw" | "$disconnect">;

export interface NotificationRuntimeDependencies {
  database: RuntimeDatabase;
  eventConsumer: EventConsumer;
  logger: Pick<Logger, "info" | "warn">;
  host: string;
  port: number;
  readinessTimeoutMs: number;
}

function withTimeout(check: Promise<boolean>, timeoutMs: number) {
  let timeout: NodeJS.Timeout | undefined;
  const expired = new Promise<false>((resolve) => {
    timeout = setTimeout(() => resolve(false), timeoutMs);
    timeout.unref();
  });
  return Promise.race([check, expired]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function checkPostgres(database: RuntimeDatabase) {
  try {
    await database.$queryRaw(Prisma.sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

export async function checkNotificationReadiness(
  dependencies: Pick<
    NotificationRuntimeDependencies,
    "database" | "eventConsumer" | "readinessTimeoutMs"
  >,
) {
  const [postgresql, rabbitmq] = await Promise.all([
    withTimeout(
      checkPostgres(dependencies.database),
      dependencies.readinessTimeoutMs,
    ),
    withTimeout(
      dependencies.eventConsumer.checkReady(),
      dependencies.readinessTimeoutMs,
    ),
  ]);
  return { postgresql, rabbitmq, ready: postgresql && rabbitmq };
}

function closeServer(server: Server) {
  if (!server.listening) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export function createNotificationRuntime(
  dependencies: NotificationRuntimeDependencies,
) {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    response.setHeader("content-type", "application/json");
    response.setHeader("cache-control", "no-store");

    if (request.method === "GET" && path === "/healthz") {
      response.writeHead(200).end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.method === "GET" && path === "/readyz") {
      void checkNotificationReadiness(dependencies)
        .then((readiness) => {
          response.writeHead(readiness.ready ? 200 : 503).end(
            JSON.stringify({
              status: readiness.ready ? "ready" : "not_ready",
              checks: {
                postgresql: readiness.postgresql,
                rabbitmq: readiness.rabbitmq,
              },
            }),
          );
        })
        .catch(() => {
          dependencies.logger.warn(
            { error: "READINESS_CHECK_FAILED" },
            "Notification readiness check failed",
          );
          response.writeHead(503).end(JSON.stringify({ status: "not_ready" }));
        });
      return;
    }
    response.writeHead(404).end(JSON.stringify({ status: "not_found" }));
  });

  return {
    server,
    async start() {
      await dependencies.eventConsumer.start();
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(dependencies.port, dependencies.host);
      });
      dependencies.logger.info(
        { host: dependencies.host, port: dependencies.port },
        "Notification service listening",
      );
    },
    async stop() {
      await closeServer(server);
      await dependencies.eventConsumer.stop();
      await dependencies.database.$disconnect();
    },
  };
}
