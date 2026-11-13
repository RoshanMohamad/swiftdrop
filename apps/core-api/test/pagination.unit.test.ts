/**
 * Unit tests for apps/core-api/src/shared/pagination.ts
 *
 * Tests the encode/decode round-trip, Prisma page args construction,
 * and the full page-info derivation logic (hasNextPage, endCursor, item slicing).
 */

import { describe, it, expect } from "@jest/globals";
import {
  encodeCursor,
  decodeCursor,
  buildPrismaPage,
  buildPageInfo,
} from "../src/shared/pagination.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRow(id: string, createdAt = new Date("2024-01-01T00:00:00Z")) {
  return { id, createdAt };
}

// ── encodeCursor / decodeCursor ───────────────────────────────────────────────

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a cursor", () => {
    const id = "cluqf4b2v0000qn0q8h0r3s5t";
    const createdAt = new Date("2024-06-15T12:34:56.789Z");
    const cursor = encodeCursor(id, createdAt);
    const decoded = decodeCursor(cursor);
    expect(decoded.id).toBe(id);
    expect(decoded.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it("produces a URL-safe base-64 string (no +, /, or trailing =)", () => {
    const cursor = encodeCursor("abc123", new Date());
    expect(cursor).not.toMatch(/[+/=]/);
  });

  it("throws RangeError for a corrupted cursor", () => {
    expect(() => decodeCursor("not-valid-base64!!!")).toThrow(RangeError);
  });

  it("throws RangeError for a valid base-64 string that is not a cursor JSON", () => {
    const junk = Buffer.from("hello world").toString("base64url");
    expect(() => decodeCursor(junk)).toThrow(RangeError);
  });

  it("throws RangeError for a cursor with an invalid createdAt date", () => {
    const bad = Buffer.from(
      JSON.stringify({ id: "x", createdAt: "not-a-date" }),
    ).toString("base64url");
    expect(() => decodeCursor(bad)).toThrow(RangeError);
  });

  it("throws RangeError for a cursor missing the id field", () => {
    const bad = Buffer.from(
      JSON.stringify({ createdAt: "2024-01-01T00:00:00Z" }),
    ).toString("base64url");
    expect(() => decodeCursor(bad)).toThrow(RangeError);
  });
});

// ── buildPrismaPage ───────────────────────────────────────────────────────────

describe("buildPrismaPage", () => {
  it("returns take+1 and no cursor for first page", () => {
    const args = buildPrismaPage(undefined, 20);
    expect(args.take).toBe(21);
    expect(args.skip).toBe(0);
    expect(args.cursor).toBeUndefined();
  });

  it("sets cursor and skip=1 when a cursor is provided", () => {
    const id = "row-id-123";
    const cursor = encodeCursor(id, new Date());
    const args = buildPrismaPage(cursor, 10);
    expect(args.take).toBe(11);
    expect(args.skip).toBe(1);
    expect(args.cursor).toEqual({ id });
  });

  it("clamps take to minimum of 1", () => {
    const args = buildPrismaPage(null, 0);
    expect(args.take).toBe(2); // 1 + 1 extra
  });

  it("clamps take to maximum of 100", () => {
    const args = buildPrismaPage(null, 999);
    expect(args.take).toBe(101); // 100 + 1 extra
  });

  it("defaults take to 20 when omitted", () => {
    const args = buildPrismaPage();
    expect(args.take).toBe(21);
  });

  it("always sets orderBy on createdAt and id asc", () => {
    const args = buildPrismaPage();
    expect(args.orderBy).toEqual({ createdAt: "asc", id: "asc" });
  });
});

// ── buildPageInfo ─────────────────────────────────────────────────────────────

describe("buildPageInfo", () => {
  it("reports hasNextPage=false when items ≤ take", () => {
    const rows = [makeRow("a"), makeRow("b"), makeRow("c")];
    const { items, pageInfo } = buildPageInfo(rows, 20);
    expect(items).toHaveLength(3);
    expect(pageInfo.hasNextPage).toBe(false);
    expect(pageInfo.endCursor).toBeNull();
  });

  it("reports hasNextPage=true and slices when rows.length > take", () => {
    // Simulate Prisma returning take+1 rows.
    const rows = Array.from({ length: 21 }, (_, i) => makeRow(`id-${i}`));
    const { items, pageInfo } = buildPageInfo(rows, 20);
    expect(items).toHaveLength(20);
    expect(pageInfo.hasNextPage).toBe(true);
    expect(pageInfo.endCursor).not.toBeNull();
  });

  it("endCursor decodes back to the last visible item's id", () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      makeRow(`id-${i}`, new Date(Date.now() + i * 1000)),
    );
    const { items, pageInfo } = buildPageInfo(rows, 10);
    expect(items).toHaveLength(10);
    const decoded = decodeCursor(pageInfo.endCursor!);
    expect(decoded.id).toBe(items[9]!.id);
  });

  it("returns empty items and no next page for empty result", () => {
    const { items, pageInfo } = buildPageInfo([], 20);
    expect(items).toHaveLength(0);
    expect(pageInfo.hasNextPage).toBe(false);
    expect(pageInfo.endCursor).toBeNull();
  });
});

