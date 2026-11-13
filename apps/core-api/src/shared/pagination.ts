/**
 * Cursor-pagination helpers for the SwiftDrop API.
 *
 * Cursors are opaque base-64 strings that encode a stable `(id, createdAt)`
 * composite so the caller never sees raw primary keys or timestamps.
 *
 * Usage pattern (Prisma):
 *   const args  = buildPrismaPage(cursor, 20);
 *   const rows  = await db.parcel.findMany({ where, ...args });
 *   const page  = buildPageInfo(rows, 20);
 *   return { items: rows, pageInfo: page };
 */

export interface PageInfo {
  /** Whether there is at least one more page after the current one. */
  hasNextPage: boolean;
  /**
   * Pass this as `cursor` on the next request to fetch the following page.
   * `null` when `hasNextPage` is `false`.
   */
  endCursor: string | null;
}

export interface PrismaPageArgs {
  take: number;
  skip: number;
  cursor?: { id: string };
  orderBy: { createdAt: "asc" | "desc"; id: "asc" | "desc" };
}

interface CursorPayload {
  id: string;
  createdAt: string; // ISO-8601
}

/**
 * Encode a stable opaque cursor from a row's `id` and `createdAt`.
 * The result is URL-safe base-64 (no `+`, `/`, or trailing `=`).
 */
export function encodeCursor(id: string, createdAt: Date): string {
  const payload: CursorPayload = { id, createdAt: createdAt.toISOString() };
  return Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode an opaque cursor back to its `id` and `createdAt` parts.
 * Throws `RangeError` on malformed input so callers can return HTTP 400.
 */
export function decodeCursor(cursor: string): { id: string; createdAt: Date } {
  let raw: string;
  try {
    // Re-pad and restore standard base-64 alphabet before decoding.
    const padded = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (padded.length % 4)) % 4;
    raw = Buffer.from(padded + "=".repeat(pad), "base64").toString("utf8");
  } catch {
    throw new RangeError("Invalid cursor: base-64 decode failed.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new RangeError("Invalid cursor: JSON parse failed.");
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as Record<string, unknown>).id !== "string" ||
    typeof (payload as Record<string, unknown>).createdAt !== "string"
  ) {
    throw new RangeError("Invalid cursor: unexpected payload shape.");
  }

  const { id, createdAt } = payload as CursorPayload;
  const date = new Date(createdAt);
  if (isNaN(date.getTime()))
    throw new RangeError("Invalid cursor: createdAt is not a valid date.");

  return { id, createdAt: date };
}

/**
 * Build the Prisma `findMany` arguments for a cursor-paginated request.
 *
 * We always fetch `take + 1` rows and slice afterward so we can detect
 * whether a next page exists without a separate `count()` query.
 *
 * @param cursor - Opaque cursor string from a previous `PageInfo.endCursor`.
 *                 Pass `undefined` or `null` to start from the beginning.
 * @param take   - Page size (default 20, max 100).
 */
export function buildPrismaPage(
  cursor?: string | null,
  take = 20,
): PrismaPageArgs {
  const safeTake = Math.min(Math.max(1, take), 100);
  const args: PrismaPageArgs = {
    take: safeTake + 1, // fetch one extra to detect hasNextPage
    skip: 0,
    orderBy: { createdAt: "asc", id: "asc" },
  };

  if (cursor) {
    const { id } = decodeCursor(cursor);
    args.cursor = { id };
    args.skip = 1; // skip the cursor row itself
  }

  return args;
}

/**
 * Derive `PageInfo` from the raw Prisma result slice.
 *
 * Call this **after** slicing to `take` items; pass the sliced array and the
 * original requested `take` so the helper knows whether to report a next page.
 *
 * @param rawItems - The unsliced array returned by Prisma (may be `take + 1`).
 * @param take     - Requested page size (same value passed to `buildPrismaPage`).
 */
export function buildPageInfo<T extends { id: string; createdAt: Date }>(
  rawItems: T[],
  take: number,
): { items: T[]; pageInfo: PageInfo } {
  const hasNextPage = rawItems.length > take;
  const items = hasNextPage ? rawItems.slice(0, take) : rawItems;
  const last = items[items.length - 1];
  return {
    items,
    pageInfo: {
      hasNextPage,
      endCursor: hasNextPage && last ? encodeCursor(last.id, last.createdAt) : null,
    },
  };
}

