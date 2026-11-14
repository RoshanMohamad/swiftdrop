import { BlockList, isIP } from "node:net";
import { lookup, type LookupAddress } from "node:dns";

export class UnsafeDestinationError extends Error {
  constructor(
    public code: "UNSAFE_DESTINATION" | "INVALID_URL",
    message: string,
  ) {
    super(message);
  }
}

// Non-public ranges a merchant URL must never reach (SSRF guard, Design Doc §9.3).
const blocked = new BlockList();
for (const [network, prefix] of [
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
  blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96], // NAT64
  ["100::", 64],
  ["2001::", 32], // Teredo
  ["2001:db8::", 32],
  ["2002::", 16], // 6to4 embeds an IPv4 address
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link local
  ["ff00::", 8], // multicast
] as const)
  blocked.addSubnet(network, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  // IPv4-mapped IPv6 could smuggle a private IPv4 target. (A ::ffff:0:0/96 BlockList rule
  // would also match every plain IPv4 address in Node, so it is handled here instead.)
  if (
    family === 6 &&
    new URL(`http://[${address}]`).hostname.startsWith("[::ffff:")
  )
    return false;
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

const bare = (hostname: string) => hostname.replace(/^\[|\]$/g, "");

/**
 * Validate the configured URL before connecting. HTTPS only, no embedded credentials, and a
 * literal IP must be public. Hostnames are re-checked per connection by `guardedLookup`.
 * `devAllowedHosts` (empty in production) permits plain HTTP to a local mock receiver.
 */
export function parseDestination(
  raw: string,
  devAllowedHosts: readonly string[] = [],
): { url: URL; dev: boolean } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeDestinationError("INVALID_URL", "Webhook URL is invalid.");
  }
  const host = bare(url.hostname).toLowerCase();
  const dev = devAllowedHosts.map((h) => h.toLowerCase()).includes(host);
  if (url.username || url.password)
    throw new UnsafeDestinationError(
      "INVALID_URL",
      "Webhook URL must not contain credentials.",
    );
  if (!host)
    throw new UnsafeDestinationError("INVALID_URL", "Webhook URL has no host.");
  if (dev) {
    if (!["http:", "https:"].includes(url.protocol))
      throw new UnsafeDestinationError("INVALID_URL", "Unsupported protocol.");
    return { url, dev };
  }
  if (url.protocol !== "https:")
    throw new UnsafeDestinationError(
      "UNSAFE_DESTINATION",
      "Webhook URL must use HTTPS.",
    );
  if (isIP(host) && !isPublicAddress(host))
    throw new UnsafeDestinationError(
      "UNSAFE_DESTINATION",
      "Webhook destination is not a public address.",
    );
  return { url, dev };
}

/**
 * DNS lookup used by the HTTP client itself, so the address that was checked is the address
 * that is connected to. A separate pre-check would be open to DNS rebinding.
 */
export function guardedLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: (
    error: Error | null,
    address?: string | LookupAddress[],
    family?: number,
  ) => void,
) {
  lookup(
    hostname,
    { all: true, family: options.family },
    (error, addresses) => {
      if (error) return callback(error);
      if (
        !addresses.length ||
        addresses.some((a) => !isPublicAddress(a.address))
      )
        return callback(
          new UnsafeDestinationError(
            "UNSAFE_DESTINATION",
            "Webhook destination resolves to a non-public address.",
          ),
        );
      if (options.all) return callback(null, addresses);
      const first = addresses[0]!;
      callback(null, first.address, first.family);
    },
  );
}
