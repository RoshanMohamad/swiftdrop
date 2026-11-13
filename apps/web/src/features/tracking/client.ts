import createClient from "openapi-fetch";
import type { paths } from "../../../../../packages/contracts/src/api.generated.js";
import {
  lifecycleResultSchema,
  cancelResultSchema,
  type StatusTransition,
} from "@swiftdrop/contracts";
import { checked, refreshSession } from "../auth/client.js";

const api = createClient<paths>({
  baseUrl: window.location.origin,
  credentials: "same-origin",
  cache: "no-store",
});

async function csrf() {
  return checked(await api.GET("/api/v1/auth/csrf"));
}

export async function updateParcelStatus(id: string, body: StatusTransition) {
  const [session, context] = await Promise.all([refreshSession(), csrf()]);
  return lifecycleResultSchema.parse(
    await checked(
      await api.PATCH("/api/v1/parcels/{id}/status", {
        params: { path: { id } },
        body,
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "X-CSRF-Token": context.csrfToken,
        },
      }),
    ),
  );
}

export async function cancelParcel(id: string, version: number) {
  const [session, context] = await Promise.all([refreshSession(), csrf()]);
  return cancelResultSchema.parse(
    await checked(
      await api.POST("/api/v1/parcels/{id}/cancel", {
        params: { path: { id } },
        body: { version },
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "X-CSRF-Token": context.csrfToken,
        },
      }),
    ),
  );
}
