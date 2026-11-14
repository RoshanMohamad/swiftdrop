// One-shot bootstrap for `docker compose up`: creates the auth signing keys and the CSRF,
// rate-limit and OAuth secrets in a shared volume if they are not there yet.
// Idempotent: existing files are never overwritten. Local development only; production keys
// come from the secret manager / Kubernetes Secrets (see deploy/helm).
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { chownSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (process.env.NODE_ENV === "production")
  throw new Error("Provision production keys through your secret manager.");

const dir = process.env.SECRETS_DIR ?? "/run/swiftdrop/auth";
const keyId = process.env.AUTH_KEY_ID ?? "local-1";
const names = ["private.pem", "public-keys.json", "csrf.key", "rate-limit.key", "oauth.key"];

mkdirSync(dir, { recursive: true, mode: 0o700 });
if (names.every((name) => existsSync(join(dir, name)))) {
  console.log("Auth secrets already present; nothing to do.");
  process.exit(0);
}
if (names.some((name) => existsSync(join(dir, name))))
  throw new Error(
    `${dir} holds only some of the auth secrets. Remove the volume (docker compose down -v) to regenerate them together.`,
  );

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
const values = [
  privateKey.export({ type: "pkcs8", format: "pem" }),
  JSON.stringify({ [keyId]: publicKey.export({ type: "spki", format: "pem" }) }),
  randomBytes(48).toString("base64url"),
  randomBytes(48).toString("base64url"),
  randomBytes(48).toString("base64url"),
];
// Services run as the unprivileged "node" user (uid 1000); this job runs as root.
chownSync(dir, 1000, 1000);
names.forEach((name, index) => {
  writeFileSync(join(dir, name), values[index], { mode: 0o600, flag: "wx" });
  chownSync(join(dir, name), 1000, 1000);
});
console.log(`Auth secrets created in ${dir}.`);
