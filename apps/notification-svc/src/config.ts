import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config as dotenv } from "dotenv";
import { z } from "zod";

let root = process.cwd();
while (!existsSync(resolve(root, "pnpm-workspace.yaml"))) {
  const parent = dirname(root);
  if (parent === root)
    throw new Error("Start notification-svc inside the SwiftDrop workspace.");
  root = parent;
}

export function loadNotificationConfig() {
  dotenv({ path: resolve(root, ".env"), quiet: true });
  const parsed = z
    .object({
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
      DATABASE_URL: z.url(),
      RABBITMQ_URL: z.url().default("amqp://guest:guest@localhost:5672"),
      SMTP_URL: z
        .url()
        .refine((value) =>
          ["smtp:", "smtps:"].includes(new URL(value).protocol),
        ),
      NOTIFICATION_PORT: z.coerce
        .number()
        .int()
        .min(1)
        .max(65535)
        .default(3002),
      INTERNAL_API_URL: z.url().default("http://127.0.0.1:3001"),
      NOTIFICATION_FROM: z.string().email().default("no-reply@swiftdrop.test"),
      NOTIFICATION_SIGNER_METADATA_FILE: z
        .string()
        .default(".local/services/notification-svc/signer.json"),
    })
    .parse(process.env);
  if (
    parsed.NODE_ENV === "production" &&
    parsed.RABBITMQ_URL === "amqp://guest:guest@localhost:5672"
  )
    throw new Error("Production requires a dedicated RabbitMQ credential.");
  return {
    ...parsed,
    root,
    signerMetadataFile: resolve(root, parsed.NOTIFICATION_SIGNER_METADATA_FILE),
  };
}
