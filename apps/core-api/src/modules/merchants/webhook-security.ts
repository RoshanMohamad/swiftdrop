import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { HttpError } from "../../shared/problem.js";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(address, prefix, "ipv6");

function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  if (family === 6) {
    if (address.toLowerCase().startsWith("::ffff:")) return false;
  }
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

export async function validateMerchantWebhookUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalidDestination();
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  )
    throw invalidDestination();

  try {
    if (isIP(host)) {
      if (!publicAddress(host)) throw invalidDestination();
    } else {
      let timeout: NodeJS.Timeout | undefined;
      const addresses = await Promise.race([
        lookup(host, { all: true, verbatim: true }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error("DNS lookup timeout")), 5000);
        }),
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });
      if (!addresses.length || addresses.some(({ address }) => !publicAddress(address)))
        throw invalidDestination();
    }
  } catch {
    throw invalidDestination();
  }
  return url.toString();
}

export function newWebhookSecret() {
  return `sd_whsec_${randomBytes(32).toString("base64url")}`;
}

const keyFor = (rootSecret: string) =>
  Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(rootSecret, "utf8"),
      Buffer.from("swiftdrop-merchant-webhooks-v1"),
      Buffer.from("merchant-webhook-signing-secret"),
      32,
    ),
  );

export function encryptWebhookSecret(value: string, rootSecret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(rootSecret), iv);
  cipher.setAAD(Buffer.from("merchant-webhook-secret:v1"));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return ["v1", iv, cipher.getAuthTag(), encrypted]
    .map((part) =>
      typeof part === "string" ? part : part.toString("base64url"),
    )
    .join(".");
}

export function decryptWebhookSecret(value: string, rootSecret: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  const iv = Buffer.from(encodedIv ?? "", "base64url");
  const tag = Buffer.from(encodedTag ?? "", "base64url");
  const ciphertext = Buffer.from(encodedCiphertext ?? "", "base64url");
  if (version !== "v1" || iv.length !== 12 || tag.length !== 16)
    throw new Error("Stored webhook secret is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", keyFor(rootSecret), iv);
  decipher.setAAD(Buffer.from("merchant-webhook-secret:v1"));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

function invalidDestination() {
  return new HttpError(
    422,
    "UNSAFE_WEBHOOK_URL",
    "Use a public HTTPS webhook URL without credentials or a fragment.",
  );
}
