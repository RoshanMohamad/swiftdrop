import { z } from "zod";
import commonPasswords from "./common-passwords.json" with { type: "json" };
export * from "./lifecycle";
import { parcelStatusSchema } from "./lifecycle";
const blocked = new Set(commonPasswords);
export const roleSchema = z.enum([
  "CUSTOMER",
  "MERCHANT",
  "COURIER",
  "DISPATCHER",
  "ADMIN",
]);
export type Role = z.infer<typeof roleSchema>;
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email("Enter a valid email address.");
export const notificationEventIdSchema = z.string().uuid();
export const notificationLookupResultSchema = z
  .object({
    eventId: z.string().uuid(),
    parcelId: z.string().uuid(),
    trackingNumber: z.string().min(1).max(16),
    customerEmail: emailSchema,
    recipientName: z.string().min(1).max(120),
    recipientPhone: z.string().regex(/^\+94[1-9]\d{8}$/),
  })
  .strict();
export const passwordSchema = z
  .string()
  .refine((value) => [...value].length >= 15, "Use at least 15 characters.")
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "Use at most 72 UTF-8 bytes (some characters use several bytes).",
  )
  .refine(
    (value) => !blocked.has(value.toLowerCase()),
    "Choose a less common password.",
  );
export const registrationSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name.")
      .max(120)
      .regex(/^[^\p{Cc}]+$/u, "Remove control characters."),
    email: emailSchema,
    phone: z
      .string()
      .trim()
      .regex(
        /^(?:0|\+94)[1-9]\d{8}$/,
        "Use a Sri Lankan number, such as 0771234567 or +94771234567.",
      )
      .transform((value) =>
        value.startsWith("0") ? `+94${value.slice(1)}` : value,
      ),
    password: passwordSchema,
  })
  .strict();
export type Registration = z.infer<typeof registrationSchema>;
export const merchantRegistrationSchema = registrationSchema
  .extend({
    businessName: z
      .string()
      .trim()
      .min(2)
      .max(160)
      .regex(/^[^\p{Cc}]+$/u),
  })
  .strict();
export type MerchantRegistration = z.infer<typeof merchantRegistrationSchema>;
export const merchantStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export const merchantReviewSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED"]),
  })
  .strict();
export type MerchantReview = z.infer<typeof merchantReviewSchema>;
export const merchantSchema = z.object({
  id: z.string().uuid(),
  userId: z.number().int().positive(),
  email: emailSchema,
  fullName: z.string(),
  phone: z.string(),
  businessName: z.string(),
  status: merchantStatusSchema,
  createdAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable(),
});
export const merchantPageSchema = z.object({
  items: z.array(merchantSchema).max(100),
});
export const merchantRegistrationResultSchema = z.object({
  message: z.string(),
});
export const merchantApiClientScopeSchema = z.enum([
  "orders:read",
  "orders:write",
]);
export type MerchantApiClientScope = z.infer<
  typeof merchantApiClientScopeSchema
>;
export const createMerchantApiClientSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[^\p{Cc}]+$/u),
    scopes: z
      .array(merchantApiClientScopeSchema)
      .min(1)
      .max(2)
      .refine((scopes) => new Set(scopes).size === scopes.length),
  })
  .strict();
export type CreateMerchantApiClient = z.infer<
  typeof createMerchantApiClientSchema
>;
export const merchantApiClientSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().regex(/^sd_cli_[A-Za-z0-9_-]{24}$/),
  name: z.string(),
  scopes: z.array(merchantApiClientScopeSchema),
  createdAt: z.string().datetime(),
  rotatedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
});
export const merchantApiClientPageSchema = z.object({
  items: z.array(merchantApiClientSchema).max(100),
});
export const merchantApiClientSecretSchema = z.object({
  client: merchantApiClientSchema,
  clientSecret: z.string().regex(/^sd_sec_[A-Za-z0-9_-]{43}$/),
});
export const merchantOAuthTokenRequestSchema = z
  .object({
    grant_type: z.literal("client_credentials"),
    scope: z.string().max(200).optional(),
  })
  .strict();
export const merchantOAuthTokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.literal("Bearer"),
    expires_in: z.literal(900),
    scope: z.string().min(1),
  })
  .strict();
export const merchantOAuthErrorSchema = z
  .object({
    error: z.enum([
      "invalid_request",
      "invalid_client",
      "invalid_grant",
      "unauthorized_client",
      "unsupported_grant_type",
      "invalid_scope",
      "server_error",
      "temporarily_unavailable",
    ]),
    error_description: z.string().optional(),
  })
  .strict();
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .min(1)
      .refine(
        (value) => new TextEncoder().encode(value).length <= 72,
        "Password exceeds 72 UTF-8 bytes.",
      ),
  })
  .strict();
export const resendVerificationSchema = z
  .object({ email: emailSchema })
  .strict();
export const verifyEmailSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export const completeProfileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name.")
      .max(120)
      .regex(/^[^\p{Cc}]+$/u, "Remove control characters."),
    phone: z
      .string()
      .trim()
      .regex(/^(?:0|\+94)[1-9]\d{8}$/, "Use a Sri Lankan phone number.")
      .transform((value) =>
        value.startsWith("0") ? `+94${value.slice(1)}` : value,
      ),
  })
  .strict();
export const googleLinkSchema = z
  .object({
    password: z
      .string()
      .min(1)
      .refine((value) => new TextEncoder().encode(value).length <= 72),
  })
  .strict();
export const emptySchema = z.object({}).strict();
export const quoteRequestSchema = z
  .object({
    originDistrict: z.string().trim().min(1).max(80),
    destinationDistrict: z.string().trim().min(1).max(80),
    weightGrams: z.number().int().min(1).max(30000),
    lengthMm: z.number().int().min(1).max(1500),
    widthMm: z.number().int().min(1).max(1500),
    heightMm: z.number().int().min(1).max(1500),
  })
  .strict();
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export const quoteSchema = quoteRequestSchema.extend({
  id: z.string().uuid(),
  feeCents: z.number().int().nonnegative(),
  currency: z.literal("LKR"),
  expiresAt: z.string().datetime(),
  originTown: z.string(),
  destinationTown: z.string(),
});
export const bookingRequestSchema = z
  .object({
    quoteId: z.string().uuid(),
    recipientName: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .regex(/^[^\p{Cc}]+$/u),
    recipientPhone: z
      .string()
      .trim()
      .regex(/^(?:0|\+94)[1-9]\d{8}$/)
      .transform((value) =>
        value.startsWith("0") ? `+94${value.slice(1)}` : value,
      ),
    recipientAddress: z
      .string()
      .trim()
      .min(5)
      .max(300)
      .regex(/^[^\p{Cc}]+$/u),
  })
  .strict();
export type BookingRequest = z.infer<typeof bookingRequestSchema>;
export const parcelSchema = z.object({
  id: z.string().uuid(),
  trackingNumber: z.string().regex(/^SD[A-Z0-9]{8}$/),
  status: parcelStatusSchema,
  feeCents: z.number().int().nonnegative(),
  currency: z.literal("LKR"),
  weightGrams: z.number().int().positive(),
  lengthMm: z.number().int().positive(),
  widthMm: z.number().int().positive(),
  heightMm: z.number().int().positive(),
  originTown: z.string(),
  destinationTown: z.string(),
  recipientName: z.string(),
  recipientPhone: z.string(),
  recipientAddress: z.string(),
  createdAt: z.string().datetime(),
  history: z
    .array(
      z.object({
        status: parcelStatusSchema,
        town: z.string(),
        createdAt: z.string().datetime(),
      }),
    )
    .max(100),
});
export const parcelPageSchema = z.object({
  items: z.array(parcelSchema),
  nextCursor: z.string().nullable(),
});
export const receiptSchema = z.object({
  receiptReference: z.string().min(1).max(40),
  downloadUrl: z.url(),
  expiresAt: z.string().datetime(),
});
export const publicTrackingSchema = z.object({
  trackingNumber: z.string(),
  status: parcelStatusSchema,
  originTown: z.string(),
  destinationTown: z.string(),
  history: z
    .array(
      z.object({
        status: parcelStatusSchema,
        town: z.string(),
        createdAt: z.string().datetime(),
      }),
    )
    .max(100),
});
export const statusTransitionSchema = z
  .object({
    to: z.enum([
      "PICKED_UP",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "FAILED",
    ]),
    town: z.string().trim().min(1).max(80),
    version: z.number().int().positive(),
  })
  .strict();
export type StatusTransition = z.infer<typeof statusTransitionSchema>;
export const cancelParcelSchema = z
  .object({ version: z.number().int().positive() })
  .strict();
export type CancelParcel = z.infer<typeof cancelParcelSchema>;
export const zoneSchema = z.object({
  id: z.number().int(),
  district: z.string(),
  town: z.string(),
  active: z.boolean(),
});
export const zoneInputSchema = z
  .object({
    district: z.string().trim().min(2).max(80),
    town: z.string().trim().min(2).max(80),
    active: z.boolean().default(true),
  })
  .strict();
export type ZoneInput = z.infer<typeof zoneInputSchema>;
export const priceInputSchema = z
  .object({
    originZoneId: z.number().int().positive(),
    destinationZoneId: z.number().int().positive(),
    baseCents: z.number().int().nonnegative().max(100000000),
    perExtraKgCents: z.number().int().nonnegative().max(100000000),
    effectiveFrom: z.string().datetime(),
  })
  .strict();
export type PriceInput = z.infer<typeof priceInputSchema>;
export const priceSchema = z.object({
  id: z.number().int(),
  originZoneId: z.number().int().positive(),
  destinationZoneId: z.number().int().positive(),
  baseCents: z.number().int().nonnegative().max(100000000),
  perExtraKgCents: z.number().int().nonnegative().max(100000000),
  effectiveFrom: z.string().datetime(),
  createdAt: z.string().datetime().optional(),
});
export const zoneListSchema = z.array(zoneSchema);
export const priceListSchema = z.array(priceSchema);
export const trackingNumberSchema = z
  .string()
  .regex(/^SD[A-Z0-9]{8}$/)
  .refine((value) => {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const body = value.slice(2, -1);
    const check =
      [...body].reduce(
        (sum, character) => sum + alphabet.indexOf(character),
        0,
      ) % alphabet.length;
    return alphabet[check] === value.at(-1);
  }, "Tracking number is invalid.");
export const publicUserSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().email(),
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  role: roleSchema,
  status: z.literal("ACTIVE"),
  emailVerified: z.boolean(),
  profileComplete: z.boolean(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;
export const staffRoleSchema = z.enum(["COURIER", "DISPATCHER"]);
export const createStaffSchema = z
  .object({
    fullName: registrationSchema.shape.fullName,
    email: emailSchema,
    phone: registrationSchema.shape.phone,
    role: staffRoleSchema,
  })
  .strict();
export type CreateStaff = z.infer<typeof createStaffSchema>;
export const staffUserSchema = z.object({
  id: z.number().int().positive(),
  email: emailSchema,
  fullName: z.string(),
  phone: z.string(),
  role: staffRoleSchema,
  status: z.enum(["INVITED", "ACTIVE", "SUSPENDED"]),
  createdAt: z.string().datetime(),
  invitationExpiresAt: z.string().datetime().nullable(),
});
export const staffPageSchema = z.object({
  items: z.array(staffUserSchema).max(101),
  nextCursor: z.string().nullable(),
});
export const adminUserSchema = staffUserSchema.extend({
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  role: roleSchema,
});
export const adminUsersPageSchema = z.object({
  items: z.array(adminUserSchema).max(100),
  nextCursor: z.string().nullable(),
});
export const userStatusChangeSchema = z
  .object({ status: z.enum(["ACTIVE", "SUSPENDED"]) })
  .strict();
export type AdminUser = z.infer<typeof adminUserSchema>;
export type UserStatusChange = z.infer<typeof userStatusChangeSchema>;
export const invitationActionSchema = z
  .object({ action: z.enum(["resend", "revoke"]) })
  .strict();
export const acceptInvitationSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    password: passwordSchema,
  })
  .strict();
export const invitationResultSchema = z.object({
  user: staffUserSchema,
  delivery: z.enum(["sent", "failed", "not_sent"]),
});
export const acceptInvitationResultSchema = z.object({
  message: z.string(),
});
export const dailyReportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  format: z.enum(["json", "csv"]).default("json").optional(),
});
export type DailyReportQuery = z.infer<typeof dailyReportQuerySchema>;

export const dailyReportItemSchema = z.object({
  date: z.string(),
  totalBooked: z.number().int().nonnegative(),
  totalDelivered: z.number().int().nonnegative(),
  totalFailed: z.number().int().nonnegative(),
  totalInTransit: z.number().int().nonnegative(),
  successRatePercent: z.number().min(0).max(100),
});
export type DailyReportItem = z.infer<typeof dailyReportItemSchema>;

export const dailyReportSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  totalBooked: z.number().int().nonnegative(),
  totalDelivered: z.number().int().nonnegative(),
  totalFailed: z.number().int().nonnegative(),
  overallSuccessRatePercent: z.number().min(0).max(100),
  days: z.array(dailyReportItemSchema),
});
export type DailyReportSummary = z.infer<typeof dailyReportSummarySchema>;

export const assistantChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});

export const assistantChatInputSchema = z
  .object({
    message: z.string().trim().min(1).max(1000),
    history: z.array(assistantChatMessageSchema).optional(),
  })
  .strict();
export type AssistantChatInput = z.infer<typeof assistantChatInputSchema>;

export const assistantChatOutputSchema = z
  .object({
    reply: z.string(),
    toolsUsed: z.array(z.string()),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type AssistantChatOutput = z.infer<typeof assistantChatOutputSchema>;

export const sessionSchema = z.object({
  state: z.literal("authenticated"),
  accessToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.literal(900),
  user: publicUserSchema,
});
export type Session = z.infer<typeof sessionSchema>;
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string(),
  code: z.string(),
  correlationId: z.string(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});
export type Problem = z.infer<typeof problemSchema>;
// Separate principals prevent future merchant/service tokens from becoming human sessions.
export type Principal =
  | { kind: "user"; id: number; role: Role }
  | {
      kind: "merchant-client";
      clientId: string;
      merchantId: string;
      scopes: string[];
    }
  | { kind: "service"; serviceId: string; scopes: string[] };
