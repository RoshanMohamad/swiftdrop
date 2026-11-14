import { describe, expect, it } from "@jest/globals";
import { checkRelay } from "../src/shared/relay-health.js";

const respond = (status: number) =>
  (async () => new Response("{}", { status })) as unknown as typeof fetch;

describe("checkRelay (/api/ready relay readiness)", () => {
  it("is skipped, not healthy, when no relay URL is configured", async () => {
    expect(await checkRelay(undefined)).toBe("not-configured");
  });

  it("is ready when the relay answers /readyz with 200", async () => {
    let called = "";
    const fetchImpl = (async (input: URL) => {
      called = String(input);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await checkRelay("http://outbox-relay:3101", fetchImpl)).toBe("ready");
    expect(called).toBe("http://outbox-relay:3101/readyz");
  });

  it("is not-ready when the relay answers 503 (broker down or poll failing)", async () => {
    expect(await checkRelay("http://relay:3101", respond(503))).toBe("not-ready");
  });

  it("is unreachable when the relay process is not running", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await checkRelay("http://relay:3101", down)).toBe("unreachable");
  });
});
