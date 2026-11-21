/**
 * Probes the outbox-relay's own /readyz. A stopped relay silently stops every event, so
 * core-api readiness must reflect it (claude.md, known open issue "Relay readiness").
 * When no URL is configured the probe is skipped and reported as such, never as healthy.
 */
export type RelayStatus = "ready" | "unreachable" | "not-ready" | "not-configured";

export async function checkRelay(
  url: string | undefined,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 2000,
): Promise<RelayStatus> {
  if (!url) return "not-configured";
  try {
    const response = await fetchImpl(new URL("/readyz", url), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? "ready" : "not-ready";
  } catch {
    return "unreachable";
  }
}
