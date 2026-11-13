import { resolve } from "node:path";
import { config as dotenv } from "dotenv";
import { z } from "zod";
import { createDatabase, Prisma, type Database } from "@swiftdrop/db";
import { createAdmin } from "./modules/users/admin.js";
import {
  AdminInputError,
  readAdminInput,
} from "./modules/users/admin-prompt.js";
import { HttpError } from "./shared/problem.js";

const controller = new AbortController();
const cancel = () => controller.abort();
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
process.on("SIGHUP", cancel);
let db: Database | undefined;
try {
  if (process.argv.length !== 2)
    throw new AdminInputError(
      "Run pnpm admin:create without arguments. All account fields are entered interactively.",
    );
  dotenv({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });
  const url = z
    .url()
    .refine((value) =>
      ["postgres:", "postgresql:"].includes(new URL(value).protocol),
    )
    .safeParse(process.env.DATABASE_URL);
  if (!url.success)
    throw new AdminInputError(
      "Configure DATABASE_URL before creating an administrator.",
    );
  const input = await readAdminInput(
    process.stdin,
    process.stdout,
    controller.signal,
  );
  if (controller.signal.aborted) throw new Error("Admin creation cancelled.");
  db = createDatabase(url.data);
  const result = await createAdmin(db, input, controller.signal);
  process.stdout.write(
    result === "created"
      ? "Administrator created. Sign in through the normal login page. Email remains unverified.\n"
      : "Active administrator already exists. No account or credentials were changed.\n",
  );
} catch (error) {
  const message =
    controller.signal.aborted ||
    (error instanceof Error && error.name === "AbortError")
      ? "Admin creation cancelled."
      : error instanceof HttpError
        ? error.message
        : error instanceof Prisma.PrismaClientKnownRequestError
          ? "Admin creation failed because the account changed or the database rejected the operation. No credentials were overwritten."
          : error instanceof AdminInputError
            ? error.message
            : "Admin creation failed. Check database availability and retry; existing accounts will not be overwritten.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
  process.removeListener("SIGINT", cancel);
  process.removeListener("SIGTERM", cancel);
  process.removeListener("SIGHUP", cancel);
}
