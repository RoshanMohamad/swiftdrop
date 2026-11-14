import { readFile } from "node:fs/promises";
import { notificationLookupResultSchema } from "@swiftdrop/contracts";
import { signServiceEventToken } from "@swiftdrop/contracts/service-auth";
import { z } from "zod";
import type { ContactLookupClient, NotificationEvent } from "./types.js";

const signerSchema = z
  .object({
    serviceId: z.literal("notification-svc"),
    serviceKind: z.literal("notification"),
    issuer: z.url(),
    audience: z.literal("swiftdrop-notification-worker"),
    scope: z
      .string()
      .refine((value) => value.split(/\s+/).includes("notifications:lookup")),
    keyId: z.string().min(1),
    privateKeyFile: z.string().min(1),
  })
  .strict();

export class ServiceJwtContactLookupClient implements ContactLookupClient {
  constructor(
    private readonly internalApiUrl: string,
    private readonly signerMetadataFile: string,
    private readonly timeoutMs = 5_000,
  ) {}

  async lookup(event: NotificationEvent) {
    const metadata = signerSchema.parse(
      JSON.parse(await readFile(this.signerMetadataFile, "utf8")),
    );
    const token = await signServiceEventToken({
      ...metadata,
      privateKey: await readFile(metadata.privateKeyFile, "utf8"),
      eventId: event.eventId,
      parcelId: event.data.parcelId,
    });
    const response = await fetch(
      `${this.internalApiUrl}/internal/v1/notifications/events/${event.eventId}`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );
    if (!response.ok)
      throw new Error(
        `Notification lookup failed with HTTP ${response.status}.`,
      );
    return notificationLookupResultSchema.parse(await response.json());
  }
}
