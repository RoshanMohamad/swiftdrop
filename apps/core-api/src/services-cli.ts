import { createPublicKey, generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createDatabase } from "@swiftdrop/db";
import { loadConfig } from "./shared/config.js";
import { signServiceEventToken } from "./modules/services/signing.js";

const config = loadConfig();
const args = process.argv.slice(2);
class CliError extends Error {}
const command = args[0]?.replace(/^services:/, "");
const flag = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const serviceId =
  command === "demo" ? "notification-svc" : (flag("--service") ?? "");
const serviceSpec = (id: string) => {
  if (id === "notification-svc")
    return {
      kind: "notification",
      audience: "swiftdrop-notification-worker",
      permissions: ["notifications:lookup"],
    };
  if (id === "webhook-svc")
    return {
      kind: "webhook",
      audience: "swiftdrop-webhook-worker",
      permissions: ["webhooks:config"],
    };
  throw new CliError("Choose notification-svc or webhook-svc.");
};
const db = createDatabase(config.DATABASE_URL);
const dirFor = (id: string) => resolve(config.root, ".local/services", id);
const writePrivate = async (path: string, data: string) => {
  try {
    await writeFile(path, data, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new CliError(
        "Service key files already exist; provisioning refuses overwrites. Use rotate for an existing service.",
      );
    throw error;
  }
  await chmod(path, 0o600);
};
const publicPem = (key: ReturnType<typeof generateKeyPairSync>) =>
  key.publicKey.export({ type: "spki", format: "pem" }).toString();
const privatePem = (key: ReturnType<typeof generateKeyPairSync>) =>
  key.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const newKey = () => generateKeyPairSync("rsa", { modulusLength: 3072 });
const assertIndependent = (key: ReturnType<typeof generateKeyPairSync>) => {
  const generated = publicPem(key);
  const humanKeys = new Set([
    createPublicKey(config.privateKey)
      .export({ type: "spki", format: "pem" })
      .toString(),
    ...Object.values(config.publicKeys).map((pem) =>
      createPublicKey(pem).export({ type: "spki", format: "pem" }).toString(),
    ),
  ]);
  if (humanKeys.has(generated))
    throw new CliError("Service key must be independent of human auth keys.");
  return generated;
};

async function provision(id: string) {
  const spec = serviceSpec(id);
  const dir = dirFor(id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const keyId = `${id}-${randomUUID()}`;
  const privatePath = join(dir, `${keyId}.pem`);
  const metadataPath = join(dir, "signer.json");
  const key = newKey();
  const generatedPublicKey = assertIndependent(key);
  let privateCreated = false;
  let metadataCreated = false;
  try {
    await writePrivate(privatePath, privatePem(key));
    privateCreated = true;
    await writePrivate(
      metadataPath,
      JSON.stringify(
        {
          serviceId: id,
          serviceKind: spec.kind,
          issuer: config.SERVICE_ISSUER,
          audience: spec.audience,
          scope: spec.permissions.join(" "),
          keyId,
          privateKeyFile: privatePath,
        },
        null,
        2,
      ) + "\n",
    );
    metadataCreated = true;
    await db.$transaction(async (tx) => {
      if (await tx.servicePrincipal.findUnique({ where: { serviceId: id } }))
        throw new CliError(
          "Service principal already exists; use rotate or revoke.",
        );
      if (
        await tx.servicePublicKey.findFirst({
          where: { publicKeyPem: generatedPublicKey },
        })
      )
        throw new CliError("Generated key is already assigned to a service.");
      await tx.servicePrincipal.create({
        data: {
          serviceId: id,
          serviceKind: spec.kind,
          audience: spec.audience,
          permissions: spec.permissions,
        },
      });
      await tx.servicePublicKey.create({
        data: {
          keyId,
          serviceId: id,
          publicKeyPem: generatedPublicKey,
          notBefore: new Date(),
        },
      });
    });
    console.log(`Provisioned ${id}; signer metadata: ${metadataPath}`);
  } catch (error) {
    if (privateCreated) await rm(privatePath, { force: true });
    if (metadataCreated) await rm(metadataPath, { force: true });
    throw error;
  }
}

async function rotate(id: string) {
  const spec = serviceSpec(id);
  const dir = dirFor(id);
  const metadataPath = join(dir, "signer.json");
  const oldMeta = JSON.parse(await readFile(metadataPath, "utf8")) as {
    keyId: string;
  };
  const key = newKey();
  const generatedPublicKey = assertIndependent(key);
  const keyId = `${id}-${randomUUID()}`;
  const privatePath = join(dir, `${keyId}.pem`);
  await writePrivate(privatePath, privatePem(key));
  try {
    await db.$transaction(async (tx) => {
      const principal = await tx.servicePrincipal.findUnique({
        where: { serviceId: id },
      });
      if (!principal || principal.revokedAt)
        throw new CliError("Service principal is unavailable.");
      const old = await tx.servicePublicKey.findUnique({
        where: { keyId: oldMeta.keyId },
      });
      if (!old || old.serviceId !== id || old.revokedAt)
        throw new CliError("Active service key is unavailable.");
      if (
        await tx.servicePublicKey.findFirst({
          where: { publicKeyPem: generatedPublicKey },
        })
      )
        throw new CliError("Generated key is already assigned to a service.");
      const retired = await tx.servicePublicKey.updateMany({
        where: { keyId: old.keyId, notAfter: null, revokedAt: null },
        data: { notAfter: new Date(Date.now() + 10 * 60_000) },
      });
      if (retired.count !== 1)
        throw new CliError("Active service key changed; retry rotation.");
      await tx.servicePublicKey.create({
        data: {
          keyId,
          serviceId: id,
          publicKeyPem: generatedPublicKey,
          notBefore: new Date(),
        },
      });
    });
    await writeFile(
      metadataPath,
      JSON.stringify(
        {
          serviceId: id,
          serviceKind: spec.kind,
          issuer: config.SERVICE_ISSUER,
          audience: spec.audience,
          scope: spec.permissions.join(" "),
          keyId,
          privateKeyFile: privatePath,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    await chmod(metadataPath, 0o600);
    console.log(`Rotated ${id}; previous key expires in 10 minutes.`);
  } catch (error) {
    await rm(privatePath, { force: true });
    throw error;
  }
}

async function revoke(id: string) {
  const keyId = flag("--key-id");
  const now = new Date();
  if (keyId) {
    const result = await db.servicePublicKey.updateMany({
      where: { keyId, serviceId: id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (!result.count)
      throw new CliError("No active key with that ID exists for the service.");
  } else {
    const result = await db.servicePrincipal.updateMany({
      where: { serviceId: id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (!result.count)
      throw new CliError("No active service principal exists.");
  }
  console.log(`Revoked ${keyId ? "key" : "principal"} for ${id}.`);
}

async function status(id: string) {
  const principal = await db.servicePrincipal.findUnique({
    where: { serviceId: id },
    include: { keys: { orderBy: { createdAt: "desc" } } },
  });
  if (!principal) throw new CliError("Service principal is not provisioned.");
  console.log(
    JSON.stringify(
      {
        serviceId: principal.serviceId,
        serviceKind: principal.serviceKind,
        audience: principal.audience,
        permissions: principal.permissions,
        active: !principal.revokedAt,
        keys: principal.keys.map(
          ({ keyId, notBefore, notAfter, revokedAt }) => ({
            keyId,
            notBefore,
            notAfter,
            revoked: Boolean(revokedAt),
            currentlyValid:
              !revokedAt &&
              notBefore <= new Date() &&
              (!notAfter || notAfter > new Date()),
          }),
        ),
      },
      null,
      2,
    ),
  );
}

async function demo() {
  const metadata = JSON.parse(
    await readFile(join(dirFor(serviceId), "signer.json"), "utf8"),
  ) as {
    keyId: string;
    privateKeyFile: string;
    serviceId: string;
    serviceKind: string;
    issuer: string;
    audience: string;
    scope: string;
  };
  const keyId = flag("--key-id") ?? metadata.keyId;
  if (!new RegExp(`^${serviceId}-[0-9a-f-]{36}$`).test(keyId))
    throw new CliError("Key ID is invalid for this service.");
  const privateKeyFile = join(dirFor(serviceId), `${keyId}.pem`);
  const event = await db.outboxEvent.findFirst({
    where: { eventType: "parcel.created" },
    orderBy: { createdAt: "desc" },
    select: { eventId: true, aggregateId: true },
  });
  if (!event)
    throw new CliError(
      "No persisted parcel.created booking is available for the demo.",
    );
  const token = await signServiceEventToken({
    ...metadata,
    keyId,
    privateKey: await readFile(privateKeyFile, "utf8"),
    eventId: event.eventId,
    parcelId: event.aggregateId,
  });
  const response = await fetch(
    `http://127.0.0.1:${config.INTERNAL_PORT}/internal/v1/notifications/events/${event.eventId}`,
    {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok)
    throw new Error(`Lookup failed with HTTP ${response.status}.`);
  const result = (await response.json()) as {
    eventId: string;
    parcelId: string;
    trackingNumber: string;
    customerEmail: string;
    recipientName: string;
    recipientPhone: string;
  };
  const [local, domain] = result.customerEmail.split("@");
  console.log(
    JSON.stringify(
      {
        eventId: result.eventId,
        parcelId: result.parcelId,
        trackingNumber: result.trackingNumber,
        customerEmail: `${local?.slice(0, 1) ?? "*"}***@${domain ?? "***"}`,
        recipientSms: `***${result.recipientPhone.slice(-4)}`,
      },
      null,
      2,
    ),
  );
}

try {
  if (command === "provision") await provision(serviceId);
  else if (command === "rotate") await rotate(serviceId);
  else if (command === "revoke") await revoke(serviceId);
  else if (command === "status") await status(serviceId);
  else if (command === "demo") await demo();
  else throw new CliError("Use provision, rotate, revoke, status, or demo.");
} catch (error) {
  console.error(
    error instanceof CliError
      ? error.message
      : "Service operation failed; check local database/configuration and retry.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
