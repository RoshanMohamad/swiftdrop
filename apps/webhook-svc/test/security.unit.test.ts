import { describe, expect, it } from "@jest/globals";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  UnsafeDestinationError,
  isPublicAddress,
  parseDestination,
} from "../src/destination.js";
import { HttpWebhookSender } from "../src/sender.js";
import { HEADERS, sign, signedHeaders, verify } from "../src/signing.js";

describe("signing (Design Doc §9.3)", () => {
  const secret = "s".repeat(32);
  const body = '{"eventId":"e"}';
  const now = new Date("2026-11-07T10:00:00Z");

  it("signs the exact body with a fresh timestamp each attempt", () => {
    const first = signedHeaders({
      secret,
      body,
      eventId: "e",
      attempt: 0,
      now,
    });
    const later = signedHeaders({
      secret,
      body,
      eventId: "e",
      attempt: 1,
      now: new Date(now.getTime() + 30_000),
    });
    expect(first[HEADERS.timestamp]).not.toBe(later[HEADERS.timestamp]);
    expect(first[HEADERS.signature]).not.toBe(later[HEADERS.signature]);
    expect(first[HEADERS.eventId]).toBe("e");
    expect(first[HEADERS.signature]).toBe(
      sign(secret, Number(first[HEADERS.timestamp]), body),
    );
  });

  it("verifies, and rejects tampering, wrong secrets and stale timestamps", () => {
    const h = signedHeaders({ secret, body, eventId: "e", attempt: 0, now });
    const base = {
      secret,
      body,
      timestamp: h[HEADERS.timestamp]!,
      signature: h[HEADERS.signature]!,
      now,
    };
    expect(verify(base)).toBe(true);
    expect(verify({ ...base, body: body + " " })).toBe(false);
    expect(verify({ ...base, secret: "t".repeat(32) })).toBe(false);
    expect(verify({ ...base, now: new Date(now.getTime() + 301_000) })).toBe(
      false,
    );
    expect(verify({ ...base, signature: "sha256=00" })).toBe(false);
    expect(verify({ ...base, timestamp: "abc" })).toBe(false);
  });
});

describe("destination guard (SSRF)", () => {
  it("classifies private, loopback, link-local and reserved addresses as unsafe", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:10.0.0.1",
      "::ffff:7f00:1",
      "2002:c0a8:0101::1",
      "64:ff9b::a00:1",
    ])
      expect(isPublicAddress(address)).toBe(false);
    for (const address of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"])
      expect(isPublicAddress(address)).toBe(true);
    expect(isPublicAddress("not-an-ip")).toBe(false);
  });

  it("requires HTTPS, no credentials and a public literal IP", () => {
    expect(parseDestination("https://hooks.example.com/x").dev).toBe(false);
    for (const url of [
      "http://hooks.example.com/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://169.254.169.254/latest",
      "ftp://hooks.example.com",
    ])
      expect(() => parseDestination(url)).toThrow(UnsafeDestinationError);
    expect(() => parseDestination("https://u:p@hooks.example.com/")).toThrow(
      UnsafeDestinationError,
    );
    expect(() => parseDestination("not a url")).toThrow(UnsafeDestinationError);
  });

  it("allows plain HTTP only to an explicit development host", () => {
    expect(
      parseDestination("http://localhost:4010/hook", ["localhost"]).dev,
    ).toBe(true);
    expect(() => parseDestination("http://localhost:4010/hook", [])).toThrow(
      UnsafeDestinationError,
    );
    expect(() =>
      parseDestination("http://localhost:4010/hook", ["other"]),
    ).toThrow(UnsafeDestinationError);
  });

  it("refuses a hostname that resolves to a loopback address when not allow-listed", async () => {
    const sender = new HttpWebhookSender();
    await expect(
      sender.send("https://localhost/hook", "{}", {}),
    ).rejects.toBeInstanceOf(UnsafeDestinationError);
  });
});

describe("HttpWebhookSender", () => {
  async function receiver(
    handler: Parameters<typeof createServer>[1] & object,
  ) {
    const server = createServer(handler);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return {
      url: `http://localhost:${(server.address() as AddressInfo).port}/hook`,
      close: () => new Promise<void>((r) => server.close(() => r())),
    };
  }
  const sender = (timeoutMs = 2000) =>
    new HttpWebhookSender({ devAllowedHosts: ["localhost"], timeoutMs });

  it("reports success for 2xx and delivers body and signature headers", async () => {
    let seen: { body: string; signature?: string } | undefined;
    const target = await receiver((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen = {
          body,
          signature: req.headers["x-swiftdrop-signature"] as string,
        };
        res.statusCode = 204;
        res.end();
      });
    });
    const result = await sender().send(target.url, '{"a":1}', {
      "Content-Type": "application/json",
      [HEADERS.signature]: "sha256=abc",
    });
    await target.close();
    expect(result).toMatchObject({ ok: true, statusCode: 204 });
    expect(seen).toEqual({ body: '{"a":1}', signature: "sha256=abc" });
  });

  it("treats non-2xx and redirects as failures without following them", async () => {
    let hits = 0;
    const target = await receiver((_req, res) => {
      hits++;
      res.statusCode = hits === 1 ? 500 : 302;
      res.setHeader("Location", "http://localhost:1/never");
      res.end();
    });
    expect(await sender().send(target.url, "{}", {})).toMatchObject({
      ok: false,
      statusCode: 500,
      errorCode: "HTTP_500",
    });
    expect(await sender().send(target.url, "{}", {})).toMatchObject({
      ok: false,
      statusCode: 302,
      errorCode: "HTTP_302",
    });
    await target.close();
    expect(hits).toBe(2);
  });

  it("times out slow receivers and reports connection failures", async () => {
    const target = await receiver(() => {
      /* never respond */
    });
    expect(await sender(300).send(target.url, "{}", {})).toMatchObject({
      ok: false,
      errorCode: "TIMEOUT",
    });
    (target as { close: () => Promise<void> }).close().catch(() => undefined);
    expect(
      await sender().send("http://localhost:1/hook", "{}", {}),
    ).toMatchObject({ ok: false, errorCode: "NETWORK" });
  });
});
