import { describe, expect, it } from "@jest/globals";
import { AssistantService } from "../src/modules/assistant/service.js";
import { PricingService } from "../src/modules/pricing/service.js";
import { ParcelService } from "../src/modules/parcels/service.js";
import type { Database } from "@swiftdrop/db";

describe("AI Delivery Assistant (FR-B2, Design Doc §12.2)", () => {
  const mockDb = {
    zone: {
      findFirst: (args: { where: { district: { equals: string } } }) => {
        const d = args.where.district.equals.toLowerCase();
        if (d === "colombo") {
          return Promise.resolve({ id: 1, district: "Colombo", town: "Colombo 01", active: true });
        }
        if (d === "kandy") {
          return Promise.resolve({ id: 2, district: "Kandy", town: "Kandy Central", active: true });
        }
        return Promise.resolve(null);
      },
      findMany: () =>
        Promise.resolve([
          { district: "Colombo", town: "Colombo 01" },
          { district: "Kandy", town: "Kandy Central" },
        ]),
    },
    priceVersion: {
      findFirst: () =>
        Promise.resolve({
          id: 1,
          originZoneId: 1,
          destinationZoneId: 2,
          baseCents: 50000,
          perExtraKgCents: 7000,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          createdAt: new Date("2026-01-01T00:00:00Z"),
        }),
    },
    parcel: {
      findMany: () =>
        Promise.resolve([
          {
            id: "p1",
            trackingNumber: "SDABC12345",
            status: "BOOKED",
            recipientName: "Nimal Perera",
            feeCents: 57000,
            createdAt: new Date("2026-11-09T10:00:00Z"),
            originZone: { town: "Colombo 01" },
            destinationZone: { town: "Kandy Central" },
            history: [{ status: "BOOKED", town: "Colombo 01", createdAt: new Date() }],
          },
        ]),
      findUnique: (args: { where: { trackingNumber: string } }) => {
        if (args.where.trackingNumber === "SDABC12345") {
          return Promise.resolve({
            id: "p1",
            trackingNumber: "SDABC12345",
            status: "IN_TRANSIT",
            recipientName: "Nimal Perera",
            feeCents: 57000,
            originZone: { town: "Colombo 01" },
            destinationZone: { town: "Kandy Central" },
            history: [
              { status: "BOOKED", town: "Colombo 01", createdAt: new Date("2026-11-09T10:00:00Z") },
              { status: "IN_TRANSIT", town: "Kadawatha", createdAt: new Date("2026-11-09T11:00:00Z") },
            ],
          });
        }
        return Promise.resolve(null);
      },
    },
  } as unknown as Database;

  const pricing = new PricingService(mockDb);
  const parcels = new ParcelService(mockDb, pricing);
  const assistant = new AssistantService(mockDb, pricing, parcels);

  it("handles greeting and returns available capabilities", async () => {
    const res = await assistant.chat(undefined, { message: "Hello there!", history: [] });
    expect(res.reply).toContain("SwiftDrop's AI Delivery Assistant");
    expect(res.toolsUsed).toEqual([]);
  });

  it("executes quote_delivery_fee tool for pricing inquiries (T1)", async () => {
    const res = await assistant.chat(undefined, {
      message: "How much to send 2 kg from Colombo to Kandy?",
      history: [],
    });
    expect(res.toolsUsed).toContain("quote_delivery_fee");
    expect(res.reply).toContain("LKR 570.00");
    expect(res.data).toBeDefined();
  });

  it("executes get_parcel_status tool when tracking number is present (T2)", async () => {
    const res = await assistant.chat(undefined, {
      message: "Where is parcel SDABC12345?",
      history: [],
    });
    expect(res.toolsUsed).toContain("get_parcel_status");
    expect(res.reply).toContain("SDABC12345");
    expect(res.reply).toContain("IN_TRANSIT");
  });

  it("executes list_my_parcels tool for authenticated users (T3)", async () => {
    const res = await assistant.chat(101, {
      message: "Can you show my parcels?",
      history: [],
    });
    expect(res.toolsUsed).toContain("list_my_parcels");
    expect(res.reply).toContain("SDABC12345");
  });

  it("prompts user to log in when asking for parcels unauthenticated (T3 auth guard)", async () => {
    const res = await assistant.chat(undefined, {
      message: "Show my bookings",
      history: [],
    });
    expect(res.toolsUsed).toContain("list_my_parcels");
    expect(res.reply).toContain("You must be signed in");
  });

  it("executes find_zone tool for coverage questions (T4)", async () => {
    const res = await assistant.chat(undefined, {
      message: "Which districts do you deliver to?",
      history: [],
    });
    expect(res.toolsUsed).toContain("find_zone");
    expect(res.reply).toContain("active districts");
  });

  it("handles unserved district quotes gracefully without throwing", async () => {
    const res = await assistant.chat(undefined, {
      message: "How much to send 2 kg from Colombo to MarsCity?",
      history: [],
    });
    expect(res.toolsUsed).toContain("quote_delivery_fee");
    expect(res.reply).toContain("not currently in our active service zones");
  });

  it("handles case-insensitive district queries in quotes", async () => {
    const res = await assistant.chat(undefined, {
      message: "Quote delivery for 1 kg from colombo to kandy",
      history: [],
    });
    expect(res.toolsUsed).toContain("quote_delivery_fee");
    expect(res.reply).toContain("LKR 500.00");
  });
});
