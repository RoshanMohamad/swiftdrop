import type { Database, Prisma } from "@swiftdrop/db";
import { registrationSchema, type Registration } from "@swiftdrop/contracts";
import { HttpError } from "../../shared/problem.js";
import { hashPassword } from "../auth/password.js";

export async function lockAdministration(tx: Prisma.TransactionClient) {
  // Shared by status changes and operator provisioning, before any user locks.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(1396982864, 1)::text`;
}

export async function createAdmin(
  db: Database,
  input: Registration,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const parsed = registrationSchema.parse(input);
  const passwordHash = await hashPassword(parsed.password);
  signal?.throwIfAborted();
  return db.$transaction(async (tx) => {
    await lockAdministration(tx);
    signal?.throwIfAborted();
    const existing = await tx.user.findUnique({
      where: { email: parsed.email },
    });
    if (existing) {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${existing.id} FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({
        where: { id: existing.id },
      });
      if (current.roleId === "ADMIN" && current.status === "ACTIVE")
        return "unchanged" as const;
      throw new HttpError(
        409,
        "ADMIN_CONFLICT",
        "An account already uses this email. No account was changed.",
      );
    }
    await tx.role.upsert({
      where: { id: "ADMIN" },
      create: { id: "ADMIN" },
      update: {},
    });
    await tx.user.create({
      data: {
        email: parsed.email,
        fullName: parsed.fullName,
        phone: parsed.phone,
        passwordHash,
        roleId: "ADMIN",
        status: "ACTIVE",
      },
    });
    signal?.throwIfAborted();
    return "created" as const;
  });
}
