import type { Database } from "@swiftdrop/db";
import type {
  AssistantChatInput,
  AssistantChatOutput,
} from "@swiftdrop/contracts";
import { PricingService } from "../pricing/service.js";
import { ParcelService } from "../parcels/service.js";

/**
 * AssistantService implements Member 03's AI Delivery Assistant (FR-B2).
 *
 * It provides an intelligent conversational assistant backed by four grounded,
 * read-only Model Context Protocol (MCP) tools:
 * 1. `quote_delivery_fee`: Calculates delivery quotes using the decoupled PricingStrategy.
 * 2. `get_parcel_status`: Queries public tracking information by tracking number.
 * 3. `list_my_parcels`: Retrieves the signed-in customer's recent delivery bookings.
 * 4. `find_zone`: Discovers active districts and coverage areas.
 *
 * All operations are strictly read-only and enforce authorization boundaries.
 */
export class AssistantService {
  /**
   * Initializes the AssistantService with necessary database and domain services.
   *
   * @param db - Prisma database client
   * @param pricing - Decoupled PricingService instance for quote calculations
   * @param parcels - ParcelService instance for tracking and customer bookings
   */
  constructor(
    private db: Database,
    private pricing: PricingService,
    private parcels: ParcelService,
  ) {}

  /**
   * MCP Tool 1: `quote_delivery_fee`
   *
   * Grounded tool to calculate instant delivery fees between two districts
   * based on parcel weight and the active versioned pricing rules.
   *
   * @param params - Object containing originDistrict, destinationDistrict, and weightKg
   * @returns Detailed quote calculation or friendly rejection reason
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
   * MCP Tool 2: `get_parcel_status`
   *
   * Grounded tool to retrieve real-time parcel tracking status,
   * lifecycle state, and route history using public tracking number.
   *
   * @param trackingNumber - 10-character parcel tracking number (e.g., "SD7A8B9C1")
   * @returns Current delivery status, origin/destination towns, and update timestamp
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
   * MCP Tool 3: `list_my_parcels`
   *
   * Authenticated grounded tool to fetch the current customer's recent deliveries.
   * Guarantees user tenant isolation by verifying the authenticated user session.
   *
   * @param userId - ID of the authenticated user requesting their parcels
   * @returns List of customer parcels or authentication prompt
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
   * MCP Tool 4: `find_zone`
   *
   * Grounded tool to query active delivery zones and operational districts.
   *
   * @param districtQuery - Optional substring filter for district search
   * @returns Active districts matching the filter criteria
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
   * Main chat processing pipeline:
   * 1. Evaluates user intent using natural language pattern matching.
   * 2. Executes appropriate grounded MCP tool with extracted parameters.
   * 3. Formats grounded response message with Markdown and metadata.
   *
   * @param userId - ID of authenticated user (if signed in)
   * @param input - AssistantChatInput containing user's chat message and history
   * @returns Grounded assistant response with toolsUsed audit list and optional data payload
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
