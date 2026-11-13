import { describe, expect, it } from "@jest/globals";
import type { Request, Response, RequestHandler } from "express";
import type { Role, PublicUser } from "@swiftdrop/contracts";
import { HttpError } from "../src/shared/problem.js";
import { authenticate, requireRole, requireCompleteProfile } from "../src/modules/auth/index.js";
import type { AuthService } from "../src/modules/auth/service.js";

type RoleOrAnonymous = Role | "ANONYMOUS";

const ALL_ROLES: RoleOrAnonymous[] = [
  "ANONYMOUS",
  "CUSTOMER",
  "MERCHANT",
  "COURIER",
  "DISPATCHER",
  "ADMIN",
];

interface MatrixRule {
  endpoint: string;
  guards: RequestHandler[];
  allowedRoles: Role[];
  description: string;
}

describe("Role × Endpoint Authorization Matrix Harness (plan.md §8.2, §12.1)", () => {
  // Mock AuthService that implements token parsing and user resolution
  const mockAuthService = {
    authenticate: async (header?: string) => {
      if (!header || !header.startsWith("Bearer ")) {
        throw new HttpError(401, "UNAUTHORISED", "Authentication required.");
      }
      const token = header.replace("Bearer ", "").trim();
      if (!token || token === "token-anonymous") {
        throw new HttpError(401, "UNAUTHORISED", "Authentication required.");
      }

      const role = token.replace("token-", "").toUpperCase() as Role;
      const validRoles: Role[] = ["CUSTOMER", "MERCHANT", "COURIER", "DISPATCHER", "ADMIN"];
      if (!validRoles.includes(role)) {
        throw new HttpError(401, "UNAUTHORISED", "Invalid token signature.");
      }

      const user: PublicUser = {
        id: 101,
        role,
        email: `${role.toLowerCase()}@swiftdrop.test`,
        fullName: `${role} Test User`,
        phone: "+94770000000",
        status: "ACTIVE",
        emailVerified: true,
        profileComplete: true,
      };

      return {
        user,
        familyId: 1,
        jti: "mock-jti",
      };
    },
  } as unknown as AuthService;

  const authGuard = authenticate(mockAuthService);

  // Exact canonical guard configurations from the domain modules
  const ENDPOINT_MATRIX: MatrixRule[] = [
    {
      endpoint: "GET /api/v1/auth/me",
      guards: [authGuard],
      allowedRoles: ["CUSTOMER", "MERCHANT", "COURIER", "DISPATCHER", "ADMIN"],
      description: "Session User Profile",
    },
    {
      endpoint: "POST /api/v1/quotes",
      guards: [authGuard, requireRole("CUSTOMER"), requireCompleteProfile],
      allowedRoles: ["CUSTOMER"],
      description: "Customer Delivery Quotes",
    },
    {
      endpoint: "POST /api/v1/parcels",
      guards: [authGuard, requireRole("CUSTOMER"), requireCompleteProfile],
      allowedRoles: ["CUSTOMER"],
      description: "Customer Parcel Booking",
    },
    {
      endpoint: "GET /api/v1/admin/users",
      guards: [authGuard, requireRole("ADMIN")],
      allowedRoles: ["ADMIN"],
      description: "Admin Staff & User Management",
    },
    {
      endpoint: "GET /api/v1/admin/merchants",
      guards: [authGuard, requireRole("ADMIN")],
      allowedRoles: ["ADMIN"],
      description: "Admin Merchant Applications",
    },
    {
      endpoint: "POST /api/v1/admin/zones",
      guards: [authGuard, requireRole("ADMIN"), requireCompleteProfile],
      allowedRoles: ["ADMIN"],
      description: "Admin Delivery Zones Configuration",
    },
    {
      endpoint: "POST /api/v1/admin/pricing",
      guards: [authGuard, requireRole("ADMIN"), requireCompleteProfile],
      allowedRoles: ["ADMIN"],
      description: "Admin Pricing Rules Configuration",
    },
    {
      endpoint: "GET /api/v1/admin/reports/daily",
      guards: [authGuard, requireRole("ADMIN", "DISPATCHER"), requireCompleteProfile],
      allowedRoles: ["ADMIN", "DISPATCHER"],
      description: "Operational Reports & Analytics",
    },
  ];

  async function evaluateGuards(
    guards: RequestHandler[],
    authHeader?: string,
  ): Promise<{ status: number; code?: string }> {
    let capturedError: HttpError | Error | null = null;

    const req = {
      get: (header: string) => {
        if (header.toLowerCase() === "authorization") return authHeader;
        return undefined;
      },
      headers: {
        authorization: authHeader,
      },
    } as unknown as Request;

    const res = {
      locals: {},
    } as unknown as Response;

    for (const guard of guards) {
      let nextError: HttpError | Error | null = null;
      await new Promise<void>((resolve) => {
        try {
          const result = guard(req, res, (err) => {
            if (err) nextError = err as HttpError | Error;
            resolve();
          });
          if (result instanceof Promise) {
            result
              .then(() => resolve())
              .catch((err: unknown) => {
                nextError = err as HttpError | Error;
                resolve();
              });
          }
        } catch (syncError: unknown) {
          nextError = syncError as HttpError | Error;
          resolve();
        }
      });

      if (nextError) {
        capturedError = nextError;
        break;
      }
    }

    if (capturedError) {
      const status =
        capturedError instanceof HttpError
          ? capturedError.status
          : "status" in capturedError && typeof (capturedError as { status?: unknown }).status === "number"
            ? (capturedError as { status: number }).status
            : 500;

      const code =
        capturedError instanceof HttpError
          ? capturedError.code
          : "code" in capturedError && typeof (capturedError as { code?: unknown }).code === "string"
            ? (capturedError as { code: string }).code
            : "ERROR";

      return { status, code };
    }

    return { status: 200, code: "OK" };
  }

  for (const rule of ENDPOINT_MATRIX) {
    describe(`${rule.description} (${rule.endpoint})`, () => {
      for (const role of ALL_ROLES) {
        const isAllowed =
          role !== "ANONYMOUS" &&
          (rule.allowedRoles.includes(role) ||
            (role === "ADMIN" && rule.allowedRoles.includes("DISPATCHER")));

        if (role === "ANONYMOUS") {
          it(`rejects unauthenticated request with 401 UNAUTHORISED`, async () => {
            const result = await evaluateGuards(rule.guards, undefined);
            expect(result.status).toBe(401);
            expect(result.code).toBe("UNAUTHORISED");
          });
        } else if (isAllowed) {
          it(`grants access to authorized role: ${role}`, async () => {
            const result = await evaluateGuards(
              rule.guards,
              `Bearer token-${role.toLowerCase()}`,
            );
            expect(result.status).toBe(200);
            expect(result.code).toBe("OK");
          });
        } else {
          it(`denies unauthorized role ${role} with 403 FORBIDDEN`, async () => {
            const result = await evaluateGuards(
              rule.guards,
              `Bearer token-${role.toLowerCase()}`,
            );
            expect(result.status).toBe(403);
            expect(result.code).toBe("FORBIDDEN");
          });
        }
      }
    });
  }
});
