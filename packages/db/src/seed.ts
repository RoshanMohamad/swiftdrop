import { config } from "dotenv";
import bcrypt from "bcrypt";
import { createDatabase, RoleName } from "./index.js";
config({ path: "../../.env", quiet: true });
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/swiftdrop"
)
  throw new Error(
    "Demo seed is restricted to the local disposable swiftdrop database.",
  );
const db = createDatabase(url.toString());
try {
  const passwordHash = await bcrypt.hash("Local demo passphrase 2026!", 12);
  for (const role of Object.values(RoleName)) {
    await db.role.upsert({
      where: { id: role },
      update: {},
      create: { id: role },
    });
    await db.user.upsert({
      where: { email: `${role.toLowerCase()}@swiftdrop.test` },
      update: {},
      create: {
        email: `${role.toLowerCase()}@swiftdrop.test`,
        passwordHash,
        fullName: `Demo ${role.toLowerCase()}`,
        phone: "+94771234567",
        roleId: role,
      },
    });
  }
  // Demo courier capacity profile so the dispatcher console can assign right after seeding.
  const courier = await db.user.findUniqueOrThrow({
    where: { email: "courier@swiftdrop.test" },
  });
  await db.courierProfile.upsert({
    where: { userId: courier.id },
    update: {},
    create: { userId: courier.id, onDuty: true, capacity: 10 },
  });
  const districts = [
    { district: "Colombo", town: "Colombo" },
    { district: "Kandy", town: "Kandy" },
    { district: "Galle", town: "Galle" },
  ];
  for (const district of districts) {
    await db.zone.upsert({
      where: { district: district.district },
      update: {},
      create: district,
    });
  }
  const colombo = await db.zone.findUniqueOrThrow({
    where: { district: "Colombo" },
  });
  const kandy = await db.zone.findUniqueOrThrow({
    where: { district: "Kandy" },
  });
  await db.priceVersion.upsert({
    where: {
      originZoneId_destinationZoneId_effectiveFrom: {
        originZoneId: colombo.id,
        destinationZoneId: kandy.id,
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      },
    },
    update: {},
    create: {
      originZoneId: colombo.id,
      destinationZoneId: kandy.id,
      baseCents: 45000,
      perExtraKgCents: 12000,
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
    },
  });
  console.log(
    "Local demo accounts seeded; existing accounts were preserved. See README for credentials.",
  );
} finally {
  await db.$disconnect();
}
