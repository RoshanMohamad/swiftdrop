import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config as dotenv } from "dotenv";
import { z } from "zod";

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NOTIFICATION_LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.url(),
    RABBITMQ_URL: z.url().default("amqp://guest:guest@localhost:5672"),
    SMTP_URL: z
      .url()
      .refine(
        (value) => ["smtp:", "smtps:"].includes(new URL(value).protocol),
        "SMTP_URL must use smtp:// or smtps://.",
      )
      .default("smtp://localhost:1025"),
    NOTIFICATION_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
    NOTIFICATION_HOST: z.string().min(1).default("127.0.0.1"),
    NOTIFICATION_READINESS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(10_000)
      .default(2_000),
    INTERNAL_API_URL: z.url().default("http://127.0.0.1:3001"),
    NOTIFICATION_FROM: z.string().email().default("no-reply@swiftdrop.test"),
    NOTIFICATION_SIGNER_METADATA_FILE: z
      .string()
      .default(".local/services/notification-svc/signer.json"),
  })
  .superRefine((value, context) => {
    if (
      value.NODE_ENV === "production" &&
      value.RABBITMQ_URL === "amqp://guest:guest@localhost:5672"
    ) {
      context.addIssue({
        code: "custom",
        path: ["RABBITMQ_URL"],
        message: "Production requires a dedicated RabbitMQ credential.",
      });
    }
  });

function findWorkspaceRoot(start = process.cwd()) {
  let root = start;
  while (!existsSync(resolve(root, "pnpm-workspace.yaml"))) {
    const parent = dirname(root);
    if (parent === root)
      throw new Error("Start notification-svc inside the SwiftDrop workspace.");
    root = parent;
  }
  return root;
}

export function parseNotificationConfig(
  environment: NodeJS.ProcessEnv,
  root = findWorkspaceRoot(),
) {
  const parsed = environmentSchema.parse(environment);
  return {
    ...parsed,
    root,
    signerMetadataFile: resolve(root, parsed.NOTIFICATION_SIGNER_METADATA_FILE),
  };
}

export type NotificationConfig = ReturnType<typeof parseNotificationConfig>;

export function loadNotificationConfig() {
  const root = findWorkspaceRoot();
  dotenv({ path: resolve(root, ".env"), quiet: true });
  return parseNotificationConfig(process.env, root);
}
