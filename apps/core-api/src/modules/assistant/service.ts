import type { Database } from "@swiftdrop/db";
import type {
  AssistantChatInput,
  AssistantChatOutput,
} from "@swiftdrop/contracts";
import { PricingService } from "../pricing/service.js";
import { ParcelService } from "../parcels/service.js";

export class AssistantService {
  constructor(
    private db: Database,
    private pricing: PricingService,
    private parcels: ParcelService,
  ) {}

  /**
   * MCP Tool 1: quote_delivery_fee
   * Calculates fee between two districts for a given weight.
   */
  async toolQuoteDeliveryFee(params: {
    originDistrict: string;
    destinationDistrict: string;
    weightKg: number;
  }) {
    const weightGrams = Math.max(100, Math.round(params.weightKg * 1000));
    const [origin, destination] = await Promise.all([
      this.db.zone.findFirst({
        where: {
          district: { equals: params.originDistrict.trim(), mode: "insensitive" },
          active: true,
        },
      }),
      this.db.zone.findFirst({
        where: {
          district: { equals: params.destinationDistrict.trim(), mode: "insensitive" },
          active: true,
        },
      }),
    ]);

    if (!origin || !destination) {
      return {
        success: false,
        message: `One or both districts (${params.originDistrict}, ${params.destinationDistrict}) are not currently in our active service zones.`,
      };
    }

    if (origin.id === destination.id) {
      return {
        success: false,
        message: "Pickup and delivery districts must be different.",
      };
    }

    const now = new Date();
    const price = await this.db.priceVersion.findFirst({
      where: {
        originZoneId: origin.id,
        destinationZoneId: destination.id,
        effectiveFrom: { lte: now },
      },
      orderBy: { effectiveFrom: "desc" },
    });

    if (!price) {
      return {
        success: false,
        message: `No active pricing rule found between ${origin.district} and ${destination.district}.`,
      };
    }

    const feeCents = this.pricing.getStrategy().calculate(
      {
        weightGrams,
        lengthMm: 100,
        widthMm: 100,
        heightMm: 100,
      },
      price,
    );

    return {
      success: true,
      originDistrict: origin.district,
      destinationDistrict: destination.district,
      originTown: origin.town,
      destinationTown: destination.town,
      weightKg: params.weightKg,
      feeCents,
      feeLkr: (feeCents / 100).toFixed(2),
      currency: "LKR",
      validity: "Quotes are valid for 15 minutes when booked via the app.",
    };
  }

  /**
   * MCP Tool 2: get_parcel_status
   * Tracks a parcel by tracking number (e.g. SD7A8B9C1).
   */
  async toolGetParcelStatus(trackingNumber: string) {
    try {
      const tracking = await this.parcels.track(trackingNumber.trim().toUpperCase());
      const latestHistory = tracking.history[tracking.history.length - 1];
      return {
        success: true,
        trackingNumber: tracking.trackingNumber,
        status: tracking.status,
        originTown: tracking.originTown,
        destinationTown: tracking.destinationTown,
        lastUpdate: latestHistory?.createdAt,
        historyCount: tracking.history.length,
      };
    } catch {
      return {
        success: false,
        message: `No delivery record found for tracking number "${trackingNumber}". Please check the number and try again.`,
      };
    }
  }

  /**
   * MCP Tool 3: list_my_parcels
   * Lists the authenticated user's recent parcels.
   */
  async toolListMyParcels(userId: number | undefined) {
    if (!userId) {
      return {
        success: false,
        message: "You must be signed in to view your parcel history. Please sign in or register to access your account.",
        parcels: [],
      };
    }

    const parcels = await this.parcels.list(userId);
    return {
      success: true,
      total: parcels.items.length,
      parcels: parcels.items.map((p) => ({
        trackingNumber: p.trackingNumber,
        status: p.status,
        recipientName: p.recipientName,
        destinationTown: p.destinationTown,
        feeLkr: (p.feeCents / 100).toFixed(2),
        createdAt: p.createdAt,
      })),
    };
  }

  /**
   * MCP Tool 4: find_zone
   * Lists active service districts and towns.
   */
  async toolFindZone(districtQuery?: string) {
    const districts = await this.db.zone.findMany({
      where: {
        active: true,
        ...(districtQuery
          ? { district: { contains: districtQuery.trim(), mode: "insensitive" } }
          : {}),
      },
      select: { district: true, town: true },
      orderBy: { district: "asc" },
      take: 20,
    });

    return {
      success: true,
      count: districts.length,
      districts,
    };
  }

  /**
   * Main chat processing endpoint:
   * Parses user intent, executes appropriate read-only MCP tools,
   * and returns grounded responses.
   */
  async chat(
    userId: number | undefined,
    input: AssistantChatInput,
  ): Promise<AssistantChatOutput> {
    const message = input.message.trim();
    const lower = message.toLowerCase();
    const toolsUsed: string[] = [];

    // Intent 1: Tracking query (e.g. "where is parcel SD12345678" or "track SD...")
    const trackingMatch = message.match(/\b(SD[A-Z0-9]{8})\b/i);
    if (trackingMatch) {
      toolsUsed.push("get_parcel_status");
      const trackingNumber = trackingMatch[1]!.toUpperCase();
      const result = await this.toolGetParcelStatus(trackingNumber);
      if (result.success) {
        return {
          reply: `📦 Parcel **${result.trackingNumber}** is currently **${result.status}** from ${result.originTown} to ${result.destinationTown}.`,
          toolsUsed,
          data: result,
        };
      }
      return {
        reply: `⚠️ I couldn't find any delivery for tracking number **${trackingNumber}**. Please verify the number on your receipt.`,
        toolsUsed,
        data: result,
      };
    }

    // Intent 2: My parcels / bookings list
    if (
      lower.includes("my parcel") ||
      lower.includes("my deliveries") ||
      lower.includes("my orders") ||
      lower.includes("my bookings") ||
      lower.includes("track my")
    ) {
      toolsUsed.push("list_my_parcels");
      const result = await this.toolListMyParcels(userId);
      if (!result.success) {
        return {
          reply: `🔒 ${result.message}`,
          toolsUsed,
          data: result,
        };
      }
      if (result.parcels.length === 0) {
        return {
          reply: "You don't have any bookings yet. You can create a new booking using the 'New delivery' button in the dashboard!",
          toolsUsed,
          data: result,
        };
      }
      const listSummary = result.parcels
        .slice(0, 5)
        .map(
          (p) =>
            `- **${p.trackingNumber}** (${p.status}) to ${p.destinationTown} (LKR ${p.feeLkr})`,
        )
        .join("\n");
      return {
        reply: `Here are your recent parcels:\n\n${listSummary}`,
        toolsUsed,
        data: result,
      };
    }

    // Intent 3: Quote delivery fee (e.g. "how much to send 2 kg from Colombo to Kandy?")
    const quotePattern =
      /(?:how much|quote|price|fee|cost).*(?:send|deliver)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:kg|kilos?|g|grams?)?\s*(?:from\s+([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+)|to\s+([A-Za-z\s]+))/i;
    const quoteMatch = message.match(quotePattern);
    if (
      quoteMatch ||
      lower.includes("how much") ||
      lower.includes("quote") ||
      lower.includes("delivery fee") ||
      lower.includes("rate")
    ) {
      // Extract weight
      const weightMatch = message.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:kg|kilo)/i);
      const weightKg = weightMatch ? parseFloat(weightMatch[1]!) : 1.0;

      // Extract districts
      let originDistrict = "";
      let destinationDistrict = "";

      const fromToMatch = message.match(/from\s+([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+?)(?:\?|$|\.|\s+with|\s+for)/i);
      if (fromToMatch) {
        originDistrict = fromToMatch[1]!.trim();
        destinationDistrict = fromToMatch[2]!.trim();
      } else {
        const fromMatch = message.match(/from\s+([A-Za-z]+)/i);
        if (fromMatch) {
          originDistrict = fromMatch[1]!.trim();
        }

        const toMatches = [...message.matchAll(/\bto\s+([A-Za-z]+)/gi)];
        const stopWords = new Set(["send", "deliver", "ship", "quote", "get", "see", "ask", "track", "check"]);
        for (const m of toMatches) {
          const candidate = m[1]!.trim();
          if (!stopWords.has(candidate.toLowerCase())) {
            destinationDistrict = candidate;
            break;
          }
        }
      }

      if (!originDistrict && destinationDistrict) {
        originDistrict = "Colombo";
      }

      if (originDistrict && destinationDistrict) {
        toolsUsed.push("quote_delivery_fee");
        const result = await this.toolQuoteDeliveryFee({
          originDistrict,
          destinationDistrict,
          weightKg,
        });

        if (result.success) {
          return {
            reply: `💡 Estimated delivery fee for **${weightKg} kg** from **${result.originDistrict}** to **${result.destinationDistrict}** is **LKR ${result.feeLkr}**.\n\n${result.validity}`,
            toolsUsed,
            data: result,
          };
        }
        return {
          reply: `⚠️ ${result.message}`,
          toolsUsed,
          data: result,
        };
      }
    }

    // Intent 4: Zone / coverage inquiry
    if (
      lower.includes("zone") ||
      lower.includes("district") ||
      lower.includes("coverage") ||
      lower.includes("where do you deliver") ||
      lower.includes("service area")
    ) {
      toolsUsed.push("find_zone");
      const result = await this.toolFindZone();
      const districtsList = result.districts.map((d: { district: string; town: string }) => `${d.district} (${d.town})`).join(", ");
      return {
        reply: `SwiftDrop currently serves **${result.count} active districts** across Sri Lanka, including: ${districtsList}.`,
        toolsUsed,
        data: result,
      };
    }

    // Default friendly fallback
    return {
      reply: `Hello! I'm SwiftDrop's AI Delivery Assistant. Here's what I can help you with:
- 💰 **Quote Fees**: Ask *"How much to send 2 kg from Colombo to Kandy?"*
- 📍 **Service Areas**: Ask *"What districts do you serve?"*
- 🔍 **Tracking**: Provide your tracking number (e.g. *"Track SD..."*)
- 📦 **My Bookings**: Ask *"Show my parcels"* (when signed in)

How can I help you today?`,
      toolsUsed: [],
    };
  }
}
