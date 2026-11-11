import { z } from "zod";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import openapiTS, { astToString } from "openapi-typescript";
import { readFile, writeFile } from "node:fs/promises";
import {
  registrationSchema,
  loginSchema,
  emptySchema,
  publicUserSchema,
  sessionSchema,
  problemSchema,
  resendVerificationSchema,
  verifyEmailSchema,
  completeProfileSchema,
  googleLinkSchema,
  quoteRequestSchema,
  quoteSchema,
  bookingRequestSchema,
  parcelSchema,
  parcelPageSchema,
  receiptSchema,
  publicTrackingSchema,
  zoneInputSchema,
  zoneSchema,
  priceInputSchema,
  priceSchema,
  createStaffSchema,
  adminUsersPageSchema,
  adminUserSchema,
  userStatusChangeSchema,
  invitationActionSchema,
  invitationResultSchema,
  acceptInvitationSchema,
  acceptInvitationResultSchema,
  notificationLookupResultSchema,
  dailyReportSummarySchema,
  assistantChatInputSchema,
  assistantChatOutputSchema,
  merchantRegistrationSchema,
  merchantReviewSchema,
  merchantSchema,
  merchantPageSchema,
  merchantRegistrationResultSchema,
} from "./index.js";
extendZodWithOpenApi(z);
const registry = new OpenAPIRegistry();
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});
registry.registerComponent("securitySchemes", "serviceBearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});
registry.registerComponent("securitySchemes", "csrfHeader", {
  type: "apiKey",
  in: "header",
  name: "X-CSRF-Token",
});
const json = (schema: z.ZodType) => ({ "application/json": { schema } });
for (const [method, suffix, input, output, status, bearer] of [
  ["get", "csrf", null, z.object({ csrfToken: z.string() }), 200, false],
  [
    "post",
    "register",
    registrationSchema,
    z.object({ message: z.string() }),
    202,
    false,
  ],
  [
    "post",
    "resend-verification",
    resendVerificationSchema,
    z.object({ message: z.string() }),
    202,
    false,
  ],
  [
    "post",
    "verify-email",
    verifyEmailSchema,
    z.object({ message: z.string() }),
    200,
    false,
  ],
  ["get", "providers", null, z.object({ google: z.boolean() }), 200, false],
  [
    "post",
    "complete-profile",
    completeProfileSchema,
    publicUserSchema,
    200,
    true,
  ],
  [
    "post",
    "google/link",
    googleLinkSchema,
    z.object({ authorizationUrl: z.url() }),
    200,
    true,
  ],
  ["post", "login", loginSchema, sessionSchema, 200, false],
  ["post", "refresh", emptySchema, sessionSchema, 200, false],
  ["post", "logout", emptySchema, null, 204, false],
  ["post", "logout-all", emptySchema, null, 204, true],
  ["get", "me", null, publicUserSchema, 200, true],
] as const) {
  registry.registerPath({
    method,
    path: `/api/v1/auth/${suffix}`,
    summary: suffix,
    security:
      method === "post"
        ? [{ csrfHeader: [], ...(bearer ? { bearerAuth: [] } : {}) }]
        : bearer
          ? [{ bearerAuth: [] }]
          : [],
    ...(input
      ? { request: { body: { required: true, content: json(input) } } }
      : {}),
    responses: {
      [status]: {
        description: "Success",
        ...(output ? { content: json(output) } : {}),
      },
      ...Object.fromEntries(
        [400, 401, 403, 413, 415, 429, 503].map((code) => [
          code,
          {
            description: "Request rejected",
            content: { "application/problem+json": { schema: problemSchema } },
          },
        ]),
      ),
    },
  });
}
for (const [method, path, input, output, status, bearer] of [
  [
    "post",
    "/api/v1/merchant/register",
    merchantRegistrationSchema,
    merchantRegistrationResultSchema,
    202,
    false,
  ],
  ["get", "/api/v1/admin/merchants", null, merchantPageSchema, 200, true],
  [
    "patch",
    "/api/v1/admin/merchants/{id}/review",
    merchantReviewSchema,
    merchantSchema,
    200,
    true,
  ],
  ["post", "/api/v1/quotes", quoteRequestSchema, quoteSchema, 201, true],
  ["post", "/api/v1/parcels", bookingRequestSchema, parcelSchema, 201, true],
  ["get", "/api/v1/parcels", null, parcelPageSchema, 200, true],
  ["get", "/api/v1/parcels/{id}", null, parcelSchema, 200, true],
  ["get", "/api/v1/parcels/{id}/receipt", null, receiptSchema, 200, true],
  [
    "get",
    "/api/v1/track/{trackingNumber}",
    null,
    publicTrackingSchema,
    200,
    false,
  ],
  ["get", "/api/v1/admin/zones", null, z.array(zoneSchema), 200, true],
  ["post", "/api/v1/admin/zones", zoneInputSchema, zoneSchema, 201, true],
  ["patch", "/api/v1/admin/zones/{id}", zoneInputSchema, zoneSchema, 200, true],
  ["delete", "/api/v1/admin/zones/{id}", null, null, 204, true],
  ["get", "/api/v1/admin/pricing", null, z.array(priceSchema), 200, true],
  ["post", "/api/v1/admin/pricing", priceInputSchema, priceSchema, 201, true],
  [
    "get",
    "/api/v1/admin/reports/daily",
    null,
    dailyReportSummarySchema,
    200,
    true,
  ],
  [
    "post",
    "/api/v1/assistant/chat",
    assistantChatInputSchema,
    assistantChatOutputSchema,
    200,
    false,
  ],
] as const) {
  registry.registerPath({
    method,
    path,
    summary: path,
    ...(path.includes("{id}") || path.includes("{trackingNumber}")
      ? {
          parameters: [
            ...(path.includes("{id}")
              ? [
                  {
                    name: "id",
                    in: "path" as const,
                    required: true,
                    schema: { type: "string" as const },
                  },
                ]
              : []),
            ...(path.includes("{trackingNumber}")
              ? [
                  {
                    name: "trackingNumber",
                    in: "path" as const,
                    required: true,
                    schema: { type: "string" as const },
                  },
                ]
              : []),
          ],
        }
      : {}),
    ...(method === "get" && path === "/api/v1/parcels"
      ? {
          parameters: [
            {
              name: "cursor",
              in: "query" as const,
              required: false,
              schema: { type: "string" as const },
            },
          ],
        }
      : {}),
    ...(method === "get" && path === "/api/v1/admin/reports/daily"
      ? {
          parameters: [
            {
              name: "from",
              in: "query" as const,
              required: false,
              schema: { type: "string" as const },
            },
            {
              name: "to",
              in: "query" as const,
              required: false,
              schema: { type: "string" as const },
            },
            {
              name: "format",
              in: "query" as const,
              required: false,
              schema: { type: "string" as const, enum: ["json", "csv"] },
            },
          ],
        }
      : {}),
    ...(method === "post" && path === "/api/v1/parcels"
      ? {
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header" as const,
              required: true,
              schema: {
                type: "string" as const,
                minLength: 16,
                maxLength: 128,
              },
            },
          ],
        }
      : {}),
    security:
      method === "get"
        ? bearer
          ? [{ bearerAuth: [] }]
          : []
        : [{ csrfHeader: [], ...(bearer ? { bearerAuth: [] } : {}) }],
    ...(input
      ? { request: { body: { required: true, content: json(input) } } }
      : {}),
    responses: {
      [status]: {
        description: "Success",
        ...(output ? { content: json(output) } : {}),
      },
      ...Object.fromEntries(
        [400, 401, 403, 404, 409, 410, 413, 415, 422, 429, 503].map((code) => [
          code,
          {
            description: "Request rejected",
            content: { "application/problem+json": { schema: problemSchema } },
          },
        ]),
      ),
    },
  });
}
registry.registerPath({
  method: "get",
  path: "/internal/v1/notifications/events/{eventId}",
  summary: "Look up booking contacts for a persisted parcel.created event",
  parameters: [
    {
      name: "eventId",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    },
  ],
  security: [{ serviceBearerAuth: [] }],
  responses: {
    200: {
      description: "Booking contact lookup",
      content: json(notificationLookupResultSchema),
    },
    ...Object.fromEntries(
      [400, 401, 403, 404, 503].map((code) => [
        code,
        {
          description: "Request rejected",
          content: { "application/problem+json": { schema: problemSchema } },
        },
      ]),
    ),
  },
});
for (const [method, path, input, output, status, bearer] of [
  ["get", "/api/v1/admin/users", null, adminUsersPageSchema, 200, true],
  [
    "patch",
    "/api/v1/admin/users/{id}/status",
    userStatusChangeSchema,
    adminUserSchema,
    200,
    true,
  ],
  [
    "post",
    "/api/v1/admin/users",
    createStaffSchema,
    invitationResultSchema,
    201,
    true,
  ],
  [
    "post",
    "/api/v1/admin/users/{id}/invitation",
    invitationActionSchema,
    invitationResultSchema,
    200,
    true,
  ],
  [
    "post",
    "/api/v1/auth/accept-invite",
    acceptInvitationSchema,
    acceptInvitationResultSchema,
    200,
    false,
  ],
] as const) {
  registry.registerPath({
    method,
    path,
    summary: path,
    ...(path.includes("{id}")
      ? {
          parameters: [
            {
              name: "id",
              in: "path" as const,
              required: true,
              schema: { type: "string" as const },
            },
          ],
        }
      : {}),
    ...(method === "get" && path === "/api/v1/admin/users"
      ? {
          parameters: [
            {
              name: "role",
              in: "query" as const,
              required: false,
              schema: {
                type: "string" as const,
                enum: [
                  "CUSTOMER",
                  "MERCHANT",
                  "COURIER",
                  "DISPATCHER",
                  "ADMIN",
                ],
              },
            },
            {
              name: "status",
              in: "query" as const,
              required: false,
              schema: {
                type: "string" as const,
                enum: ["INVITED", "ACTIVE", "SUSPENDED"],
              },
            },
            {
              name: "cursor",
              in: "query" as const,
              required: false,
              schema: { type: "string" as const },
            },
            {
              name: "limit",
              in: "query" as const,
              required: false,
              schema: { type: "integer" as const, minimum: 1, maximum: 100 },
            },
          ],
        }
      : {}),
    security:
      method === "get"
        ? [{ bearerAuth: [] }]
        : [{ csrfHeader: [], ...(bearer ? { bearerAuth: [] } : {}) }],
    ...(input
      ? { request: { body: { required: true, content: json(input) } } }
      : {}),
    responses: {
      [status]: {
        description: "Success",
        ...(output ? { content: json(output) } : {}),
      },
      ...Object.fromEntries(
        [400, 401, 403, 404, 409, 410, 413, 415, 422, 429, 503].map((code) => [
          code,
          {
            description: "Request rejected",
            content: { "application/problem+json": { schema: problemSchema } },
          },
        ]),
      ),
    },
  });
}
const doc = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  openapi: "3.0.3",
  info: { title: "SwiftDrop customer authentication", version: "0.1.0" },
  servers: [{ url: "/" }],
});
const outputs: Record<string, string> = {
  "openapi.json": JSON.stringify(doc, null, 2) + "\n",
  "src/api.generated.ts": astToString(
    await openapiTS(JSON.parse(JSON.stringify(doc))),
  ),
};
for (const [file, contents] of Object.entries(outputs)) {
  if (process.argv.includes("--check")) {
    if ((await readFile(file, "utf8")) !== contents)
      throw new Error(
        `Contract drift in ${file}; run pnpm contracts:generate.`,
      );
  } else await writeFile(file, contents);
}
