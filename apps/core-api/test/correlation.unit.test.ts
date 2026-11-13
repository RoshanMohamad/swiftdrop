import { describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";
import pino from "pino";
import { correlationMiddleware } from "../src/shared/correlation.js";

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
