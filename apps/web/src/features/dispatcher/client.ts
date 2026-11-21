import {
  assignResultSchema,
  courierListSchema,
  courierSummarySchema,
  dispatchParcelPageSchema,
  type CourierProfileUpdate,
  type DispatchState,
} from "@swiftdrop/contracts";
import { api, bearer, checked, csrf } from "../auth/client.js";

async function authHeaders() {
  const session = await bearer();
  return { Authorization: `Bearer ${session.accessToken}` };
}

export async function listDispatchParcels(filters: {
  state: DispatchState;
  zoneId?: number;
  cursor?: string;
}) {
  return dispatchParcelPageSchema.parse(
    await checked(
      await api.GET("/api/v1/dispatch/parcels", {
        params: { query: { ...filters, limit: 25 } },
        headers: await authHeaders(),
      }),
    ),
  );
}

export async function listCouriers() {
  return courierListSchema.parse(
    await checked(
      await api.GET("/api/v1/dispatch/couriers", {
        headers: await authHeaders(),
      }),
    ),
  ).items;
}

export async function updateCourierProfile(
  courierId: number,
  change: CourierProfileUpdate,
) {
  const headers = await authHeaders();
  const context = await csrf();
  return courierSummarySchema.parse(
    await checked(
      await api.PATCH("/api/v1/dispatch/couriers/{courierId}", {
        params: { path: { courierId } },
        body: change,
        headers: { ...headers, "X-CSRF-Token": context.csrfToken },
      }),
    ),
  );
}

export async function assignParcel(
  parcelId: string,
  courierId: number,
  version: number,
) {
  const headers = await authHeaders();
  const context = await csrf();
  return assignResultSchema.parse(
    await checked(
      await api.POST("/api/v1/dispatch/parcels/{id}/assign", {
        params: { path: { id: parcelId } },
        body: { courierId, version },
        headers: { ...headers, "X-CSRF-Token": context.csrfToken },
      }),
    ),
  );
}
