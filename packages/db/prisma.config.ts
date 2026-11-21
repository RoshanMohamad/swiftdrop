import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";
config({ path: "../../.env", quiet: true });
export default defineConfig({
  // Prisma's multi-file schema keeps each delivery slice in its owned file.
  schema: "prisma",
  migrations: { path: "prisma/migrations", seed: "tsx src/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});
