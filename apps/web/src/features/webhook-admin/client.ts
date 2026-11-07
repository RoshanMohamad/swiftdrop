import {
  webhookDeliveryDetailSchema,
  webhookDeliveryPageSchema,
  webhookReplayRequestSchema,
  webhookReplayResultSchema,
  type WebhookDeliveryStatus,
} from "@swiftdrop/contracts";
import { api, bearer, checked, csrf } from "../auth/client.js";

export async function listWebhookDeliveries(filters: {
  status?: WebhookDeliveryStatus;
  cursor?: string;
}) {
  const session = await bearer();
  return webhookDeliveryPageSchema.parse(
    await checked(
      await api.GET("/api/v1/admin/webhook-deliveries", {
        params: { query: filters },
        headers: { Authorization: `Bearer ${session.accessToken}` },
      }),
    ),
  );
}

export async function getWebhookDelivery(id: string) {
  const session = await bearer();
  return webhookDeliveryDetailSchema.parse(
    await checked(
      await api.GET("/api/v1/admin/webhook-deliveries/{id}", {
        params: { path: { id } },
        headers: { Authorization: `Bearer ${session.accessToken}` },
      }),
    ),
  );
}

export async function replayWebhookDelivery(id: string, reason: string) {
  const session = await bearer();
  const context = await csrf();
  return webhookReplayResultSchema.parse(
    await checked(
      await api.POST("/api/v1/admin/webhook-deliveries/{id}/replay", {
        params: { path: { id } },
        body: webhookReplayRequestSchema.parse({ reason }),
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "X-CSRF-Token": context.csrfToken,
        },
      }),
    ),
  );
}
