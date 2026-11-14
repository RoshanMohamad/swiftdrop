import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config as dotenv } from "dotenv";
import { z } from "zod";
let root = process.cwd();
while (!existsSync(resolve(root, "pnpm-workspace.yaml"))) {
  const parent = dirname(root);
  if (parent === root)
    throw new Error("Start the API inside the SwiftDrop workspace.");
  root = parent;
}
// Running source or the bundled server uses the same workspace-relative secret paths.
export function loadConfig() {
  dotenv({ path: resolve(root, ".env"), quiet: true });
  const env = z
    .object({
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
      PORT: z.coerce.number().int().min(1).max(65535).default(3000),
      INTERNAL_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
      // Bind addresses. Loopback by default; containers set HOST=0.0.0.0. The internal listener
      // must never be published or routed through nginx/Ingress.
      HOST: z.string().min(1).default("127.0.0.1"),
      INTERNAL_HOST: z.string().min(1).default("127.0.0.1"),
      // Number of trusted reverse-proxy hops (nginx / Ingress) in front of the API, so req.ip and
      // the per-IP rate limits see the real client. 0 = no proxy (default for local dev).
      TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
      // Base URL of outbox-relay's health server; when set, /api/ready reports the relay.
      OUTBOX_RELAY_URL: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.url().optional(),
      ),
      APP_ORIGIN: z.url(),
      API_ISSUER: z.url(),
      HUMAN_AUDIENCE: z.string().min(1),
      SERVICE_ISSUER: z.url().default("http://127.0.0.1:3001"),
      DATABASE_URL: z.url(),
      MINIO_ENDPOINT: z.url().default("http://localhost:9000"),
      MINIO_ACCESS_KEY: z.string().min(1).default("swiftdrop"),
      MINIO_SECRET_KEY: z.string().min(1).default("local-development-only"),
      MINIO_BUCKET: z
        .string()
        .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
        .default("swiftdrop-receipts"),
      REDIS_URL: z.url(),
      RABBITMQ_URL: z.url().default("amqp://guest:guest@localhost:5672"),
      AUTH_PRIVATE_KEY_FILE: z.string().min(1),
      AUTH_PUBLIC_KEYS_FILE: z.string().min(1),
      AUTH_KEY_ID: z.string().min(1),
      CSRF_SECRET_FILE: z.string().min(1),
      RATE_LIMIT_SECRET_FILE: z.string().min(1),
      SMTP_URL: z
        .url()
        .refine(
          (value) => ["smtp:", "smtps:"].includes(new URL(value).protocol),
          "SMTP_URL must use smtp or smtps.",
        )
        .default("smtp://localhost:1025"),
      OAUTH_TRANSACTION_SECRET_FILE: z
        .string()
        .min(1)
        .default(".local/auth/oauth.key"),
      GOOGLE_CLIENT_ID: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().min(1).optional(),
      ),
      GOOGLE_CLIENT_SECRET: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().min(1).optional(),
      ),
      GOOGLE_CALLBACK_URL: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.url().optional(),
      ),
      COOKIE_SECURE: z.enum(["true", "false"]),
      CUSTOMER_IDLE_SECONDS: z.coerce.number().int().positive().default(604800),
      CUSTOMER_ABSOLUTE_SECONDS: z.coerce
        .number()
        .int()
        .positive()
        .default(2592000),
      STAFF_IDLE_SECONDS: z.coerce.number().int().positive().default(43200),
      STAFF_ABSOLUTE_SECONDS: z.coerce.number().int().positive().default(86400),
    })
    .superRefine((value, context) => {
      if (value.PORT === value.INTERNAL_PORT)
        context.addIssue({
          code: "custom",
          path: ["INTERNAL_PORT"],
          message: "Internal and browser-facing ports must be different.",
        });
      const configured = [
        value.GOOGLE_CLIENT_ID,
        value.GOOGLE_CLIENT_SECRET,
        value.GOOGLE_CALLBACK_URL,
      ].filter(Boolean).length;
      if (configured !== 0 && configured !== 3)
        context.addIssue({
          code: "custom",
          message:
            "Google client ID, secret and callback URL must be configured together.",
        });
      if (
        value.GOOGLE_CALLBACK_URL &&
        new URL(value.GOOGLE_CALLBACK_URL).origin !== value.APP_ORIGIN
      )
        context.addIssue({
          code: "custom",
          message: "Google callback URL must use APP_ORIGIN.",
        });
      if (
        value.GOOGLE_CALLBACK_URL &&
        new URL(value.GOOGLE_CALLBACK_URL).pathname !==
          "/api/v1/auth/google/callback"
      )
        context.addIssue({
          code: "custom",
          message: "Google callback URL must use the auth callback path.",
        });
    })
    .parse(process.env);
  const origin = new URL(env.APP_ORIGIN);
  if (origin.origin !== env.APP_ORIGIN)
    throw new Error("APP_ORIGIN must be an exact origin without a path.");
  const secure = env.COOKIE_SECURE === "true";
  if (
    !secure &&
    (env.NODE_ENV === "production" ||
      !["localhost", "127.0.0.1"].includes(origin.hostname))
  )
    throw new Error("Insecure cookies require explicit local development.");
  if (
    env.NODE_ENV === "production" &&
    (origin.protocol !== "https:" ||
      new URL(env.API_ISSUER).protocol !== "https:" ||
      new URL(env.SERVICE_ISSUER).protocol !== "https:")
  )
    throw new Error("Production requires HTTPS for all token issuers.");
  const read = (path: string) => readFileSync(resolve(root, path), "utf8");
  const csrfSecret = read(env.CSRF_SECRET_FILE).trim();
  const rateSecret = read(env.RATE_LIMIT_SECRET_FILE).trim();
  const oauthSecret = read(env.OAUTH_TRANSACTION_SECRET_FILE).trim();
  if (
    csrfSecret.length < 43 ||
    rateSecret.length < 43 ||
    oauthSecret.length < 43 ||
    new Set([csrfSecret, rateSecret, oauthSecret]).size !== 3
  )
    throw new Error(
      "Independent strong CSRF and rate-limit secrets are required.",
    );
  if (
    env.NODE_ENV === "production" &&
    [
      env.AUTH_PRIVATE_KEY_FILE,
      env.CSRF_SECRET_FILE,
      env.RATE_LIMIT_SECRET_FILE,
      env.OAUTH_TRANSACTION_SECRET_FILE,
    ].some((path) => path.includes(".local"))
  )
    throw new Error("Production refuses generated demo keys.");
  if (
    env.NODE_ENV === "production" &&
    env.RABBITMQ_URL === "amqp://guest:guest@localhost:5672"
  )
    throw new Error("Production requires a dedicated RabbitMQ credential.");
  if (
    env.NODE_ENV === "production" &&
    (env.MINIO_ENDPOINT.startsWith("http://localhost") ||
      env.MINIO_ACCESS_KEY === "swiftdrop" ||
      env.MINIO_SECRET_KEY === "local-development-only")
  )
    throw new Error(
      "Production requires dedicated MinIO credentials and endpoint.",
    );
  return {
    ...env,
    root,
    secure,
    csrfSecret,
    rateSecret,
    oauthSecret,
    privateKey: read(env.AUTH_PRIVATE_KEY_FILE),
    publicKeys: z
      .record(z.string(), z.string())
      .parse(JSON.parse(read(env.AUTH_PUBLIC_KEYS_FILE))),
  };
}
export type Config = ReturnType<typeof loadConfig>;
