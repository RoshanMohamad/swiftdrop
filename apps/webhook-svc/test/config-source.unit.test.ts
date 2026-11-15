import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { ConfigLookupError, HttpConfigSource } from "../src/config-source.js";

const MERCHANT = "33333333-3333-4333-8333-333333333333";
const context = {
  eventId: "11111111-1111-4111-8111-111111111111",
  parcelId: "22222222-2222-4222-8222-222222222222",
};
const secret = "a-very-long-signing-secret-value";

let dir: string;
let signerFile: string;
let baseUrl: string;
let server: ReturnType<typeof createServer>;
let respond: (req: IncomingMessage) => { status: number; body?: unknown } = () => ({
  status: 404,
});
const seen: IncomingMessage[] = [];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "webhook-signer-"));
  const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
  const keyFile = join(dir, "key.pem");
  await writeFile(
    keyFile,
    pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  );
  signerFile = join(dir, "signer.json");
  await writeFile(
    signerFile,
    JSON.stringify({
      serviceId: "webhook-svc",
      serviceKind: "webhook",
      issuer: "https://issuer.example.test",
      audience: "webhooks-test",
      scope: "webhooks:config",
      keyId: "webhook-key-1",
      privateKeyFile: keyFile,
    }),
  );
  server = createServer((req, res) => {
    seen.push(req);
    const { status, body } = respond(req);
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(body === undefined ? "" : JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

describe("HttpConfigSource (X-11)", () => {
  it("sends an event-bound service token and returns the target", async () => {
    seen.length = 0;
    respond = () => ({ status: 200, body: { url: "https://shop.test/h", secret } });
    const target = await new HttpConfigSource({ baseUrl, signerFile }).get(
      MERCHANT,
      context,
    );
    expect(target).toEqual({ url: "https://shop.test/h", secret });
    const request = seen[0]!;
    expect(request.url).toBe(
      `/internal/v1/webhooks/merchants/${MERCHANT}/config?eventId=${context.eventId}`,
    );
    const token = request.headers.authorization!.replace("Bearer ", "");
    expect(decodeProtectedHeader(token)).toMatchObject({
      alg: "RS256",
      kid: "webhook-key-1",
    });
    const claims = decodeJwt(token);
    expect(claims).toMatchObject({
      sub: "webhook-svc",
      aud: "webhooks-test",
      eventId: context.eventId,
      parcelId: context.parcelId,
      scope: "webhooks:config",
    });
    expect(claims.exp! - claims.iat!).toBeLessThanOrEqual(300);
  });

  it("treats 404 as not configured", async () => {
    respond = () => ({ status: 404 });
    expect(
      await new HttpConfigSource({ baseUrl, signerFile }).get(MERCHANT, context),
    ).toBeNull();
  });

  it("throws so the attempt is retried on server errors, bad bodies and outages", async () => {
    const source = new HttpConfigSource({ baseUrl, signerFile });
    respond = () => ({ status: 503 });
    await expect(source.get(MERCHANT, context)).rejects.toBeInstanceOf(
      ConfigLookupError,
    );
    respond = () => ({ status: 200, body: { url: "x", secret: "short" } });
    await expect(source.get(MERCHANT, context)).rejects.toBeInstanceOf(
      ConfigLookupError,
    );
    respond = () => ({ status: 200, body: { url: "x", secret, extra: 1 } });
    await expect(source.get(MERCHANT, context)).rejects.toBeInstanceOf(
      ConfigLookupError,
    );
    await expect(
      new HttpConfigSource({
        baseUrl: "http://127.0.0.1:1",
        signerFile,
      }).get(MERCHANT, context),
    ).rejects.toBeInstanceOf(ConfigLookupError);
  });

  it("does not follow redirects", async () => {
    respond = () => ({ status: 302 });
    await expect(
      new HttpConfigSource({ baseUrl, signerFile }).get(MERCHANT, context),
    ).rejects.toBeInstanceOf(ConfigLookupError);
  });
});
