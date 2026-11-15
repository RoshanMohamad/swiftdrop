import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RestError, type SwiftDropApi } from "./rest.js";

type Quote = {
  feeCents: number;
  currency: string;
  originTown: string;
  destinationTown: string;
};
type Tracking = {
  trackingNumber: string;
  status: string;
  originTown: string;
  destinationTown: string;
  history: Array<{ status: string; createdAt: string }>;
};
type ParcelList = {
  items: Array<{
    trackingNumber: string;
    status: string;
    destinationTown: string;
    feeCents: number;
    createdAt: string;
  }>;
};
type Zone = { district: string; town: string; active?: boolean };

const lkr = (cents: number) => (cents / 100).toFixed(2);
const text = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
});
const failure = (error: unknown) =>
  text(
    {
      success: false,
      message:
        error instanceof RestError
          ? error.message
          : "SwiftDrop is temporarily unavailable. Please try again.",
    },
    true,
  );

/**
 * The four MCP tools. All are read-only and go through the REST API with the caller's JWT.
 * Do not add tools that create, change or cancel parcels.
 */
export function createToolServer(
  api: SwiftDropApi,
  bearer: string | undefined,
) {
  const server = new McpServer({
    name: "swiftdrop-assistant",
    version: "1.0.0",
  });

  server.registerTool(
    "quote_delivery_fee",
    {
      description:
        "Estimate the delivery fee in LKR between two Sri Lankan districts for a parcel weight. Nothing is booked or stored.",
      inputSchema: {
        originDistrict: z.string().trim().min(1).max(80),
        destinationDistrict: z.string().trim().min(1).max(80),
        weightKg: z.number().positive().max(30),
      },
    },
    async ({ originDistrict, destinationDistrict, weightKg }) => {
      try {
        const quote = await api.get<Quote>(
          "/api/v1/quotes/estimate",
          {
            originDistrict,
            destinationDistrict,
            weightGrams: Math.max(1, Math.round(weightKg * 1000)),
          },
          bearer,
        );
        return text({
          success: true,
          originTown: quote.originTown,
          destinationTown: quote.destinationTown,
          weightKg,
          feeCents: quote.feeCents,
          feeLkr: lkr(quote.feeCents),
          currency: quote.currency,
          note: "Estimate only. Book in the app to lock a price for 15 minutes.",
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_parcel_status",
    {
      description:
        "Get the current status and last update of a parcel by tracking number.",
      inputSchema: { trackingNumber: z.string().trim().min(4).max(32) },
    },
    async ({ trackingNumber }) => {
      try {
        const parcel = await api.get<Tracking>(
          `/api/v1/track/${encodeURIComponent(trackingNumber.toUpperCase())}`,
          {},
          bearer,
        );
        const last = parcel.history[parcel.history.length - 1];
        return text({
          success: true,
          trackingNumber: parcel.trackingNumber,
          status: parcel.status,
          originTown: parcel.originTown,
          destinationTown: parcel.destinationTown,
          lastUpdate: last?.createdAt,
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "list_my_parcels",
    {
      description:
        "List the signed-in customer's recent parcels. Requires the user's sign-in token.",
      inputSchema: {},
    },
    async () => {
      if (!bearer)
        return text(
          {
            success: false,
            message: "Sign in to see your parcels.",
            parcels: [],
          },
          true,
        );
      try {
        const list = await api.get<ParcelList>("/api/v1/parcels", {}, bearer);
        return text({
          success: true,
          total: list.items.length,
          parcels: list.items.map((p) => ({
            trackingNumber: p.trackingNumber,
            status: p.status,
            destinationTown: p.destinationTown,
            feeLkr: lkr(p.feeCents),
            createdAt: p.createdAt,
          })),
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "find_zone",
    {
      description:
        "Find active delivery districts, optionally filtered by a name fragment.",
      inputSchema: { query: z.string().trim().max(80).optional() },
    },
    async ({ query }) => {
      try {
        const zones = await api.get<Zone[]>("/api/v1/zones", {}, bearer);
        const needle = query?.toLowerCase();
        const districts = zones
          .filter((zone) => zone.active !== false)
          .filter(
            (zone) => !needle || zone.district.toLowerCase().includes(needle),
          )
          .slice(0, 20)
          .map((zone) => ({ district: zone.district, town: zone.town }));
        return text({ success: true, count: districts.length, districts });
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
