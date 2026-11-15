import { describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";
import pino from "pino";
import {
  correlationMiddleware,
  currentCorrelationId,
} from "../src/shared/correlation.js";
import { addOutboxEvent } from "../src/shared/outbox/index.js";

describe("Correlation Middleware (shared/correlation.ts)", () => {
  function createMockContext(headers: Record<string, string | string[] | undefined> = {}) {
    const req = {
      headers,
    } as unknown as Request;

    const headerMap = new Map<string, string>();
    const res = {
      locals: {},
      setHeader: jest.fn((key: string, value: string) => {
        headerMap.set(key.toLowerCase(), value);
      }),
    } as unknown as Response;

    const next = jest.fn();

    return { req, res, next, headerMap };
  }

  it("generates a new correlation UUID when x-correlation-id header is absent", () => {
    const { req, res, next, headerMap } = createMockContext();
    const middleware = correlationMiddleware();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.locals.correlationId).toBeDefined();
    expect(typeof res.locals.correlationId).toBe("string");
    // Standard UUID v4 regex
    expect(res.locals.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(headerMap.get("x-correlation-id")).toBe(res.locals.correlationId);
    expect(headerMap.get("cache-control")).toBe("no-store");
  });

  it("propagates an existing incoming x-correlation-id header", () => {
    const existingId = "sd-trace-req-998877";
    const { req, res, next, headerMap } = createMockContext({
      "x-correlation-id": existingId,
    });
    const middleware = correlationMiddleware();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.locals.correlationId).toBe(existingId);
    expect(headerMap.get("x-correlation-id")).toBe(existingId);
  });

  it("binds a child logger containing the correlationId to res.locals.logger and res.locals.log", () => {
    const customLogger = pino();
    const childSpy = jest.spyOn(customLogger, "child");

    const { req, res, next } = createMockContext({
      "x-correlation-id": "custom-id-123",
    });
    const middleware = correlationMiddleware(customLogger);

    middleware(req, res, next);

    expect(childSpy).toHaveBeenCalledWith({ correlationId: "custom-id-123" });
    expect(res.locals.logger).toBeDefined();
    expect(res.locals.log).toBe(res.locals.logger);
  });
});

describe("correlation context (NFR-13)", () => {
  const run = (header?: string) => {
    const headers: Record<string, string> = header
      ? { "x-correlation-id": header }
      : {};
    const res = {
      locals: {},
      setHeader: jest.fn(),
    } as unknown as Response;
    let seen: string | undefined;
    let afterAwait: string | undefined;
    correlationMiddleware()({ headers } as unknown as Request, res, (() => {
      seen = currentCorrelationId();
      void Promise.resolve().then(() => {
        afterAwait = currentCorrelationId();
      });
    }) as never);
    return { res, seen: () => seen, afterAwait: () => afterAwait };
  };

  it("exposes the request's id to code run by the handler, across awaits", async () => {
    const r = run("req-1234-abcd");
    await Promise.resolve();
    expect(r.seen()).toBe("req-1234-abcd");
    expect(r.afterAwait()).toBe("req-1234-abcd");
    expect(currentCorrelationId()).toBeUndefined();
  });

  it("replaces unsafe incoming ids instead of logging or forwarding them", () => {
    for (const bad of ["short", "has spaces in it", "x".repeat(65), "a	b-1234567"]) {
      const r = run(bad);
      expect(r.res.locals.correlationId).not.toBe(bad);
      expect(r.seen()).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("stores the id on the outbox row inside a request and none outside one", async () => {
    const created: Array<{ data: { correlationId: string | null } }> = [];
    const tx = {
      outboxEvent: {
        create: async (args: (typeof created)[number]) => void created.push(args),
      },
    };
    const input = {
      type: "parcel.created",
      aggregateId: "11111111-1111-4111-8111-111111111111",
      sequence: 1,
      data: { parcelId: "11111111-1111-4111-8111-111111111111", trackingNo: "SD1" },
    };
    await addOutboxEvent(tx as never, input);
    let inside: Promise<unknown> = Promise.resolve();
    correlationMiddleware()(
      { headers: { "x-correlation-id": "req-1234-abcd" } } as unknown as Request,
      { locals: {}, setHeader: jest.fn() } as unknown as Response,
      (() => {
        inside = addOutboxEvent(tx as never, input);
      }) as never,
    );
    await inside;
    expect(created[0]!.data.correlationId).toBeNull();
    expect(created[1]!.data.correlationId).toBe("req-1234-abcd");
  });
});
