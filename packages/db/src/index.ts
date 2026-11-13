import { PrismaClient } from "./generated/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
export { Prisma, RoleName, UserStatus } from "./generated/client.js";
export type {
  User,
  AuthSession,
  ProcessedEvent,
  NotificationLog,
} from "./generated/client.js";
export function createDatabase(url: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
export type Database = ReturnType<typeof createDatabase>;
