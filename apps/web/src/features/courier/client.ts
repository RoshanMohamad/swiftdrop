import {
  courierJobsSchema,
  courierStatusResultSchema,
  courierSummarySchema,
  proofUploadResultSchema,
  type CourierStatusUpdate,
} from "@swiftdrop/contracts";
import { ApiError, api, bearer, checked, csrf } from "../auth/client.js";

async function authHeaders() {
  const session = await bearer();
  return { Authorization: `Bearer ${session.accessToken}` };
}

export async function getCourierJobs() {
  return courierJobsSchema.parse(
    await checked(
      await api.GET("/api/v1/courier/jobs", { headers: await authHeaders() }),
    ),
  );
}

export async function updateJobStatus(
  parcelId: string,
  key: string,
  body: CourierStatusUpdate,
) {
  const headers = await authHeaders();
  const context = await csrf();
  return courierStatusResultSchema.parse(
    await checked(
      await api.PATCH("/api/v1/courier/jobs/{id}/status", {
        params: { path: { id: parcelId }, header: { "Idempotency-Key": key } },
        body,
        headers: { ...headers, "X-CSRF-Token": context.csrfToken },
      }),
    ),
  );
}

export async function setDuty(onDuty: boolean) {
  const headers = await authHeaders();
  const context = await csrf();
  return courierSummarySchema.parse(
    await checked(
      await api.PATCH("/api/v1/courier/duty", {
        body: { onDuty },
        headers: { ...headers, "X-CSRF-Token": context.csrfToken },
      }),
    ),
  );
}

/** Binary upload: bearer-authenticated, so it needs no CSRF token (the server checks Origin). */
export async function uploadProof(parcelId: string, photo: Blob) {
  const headers = await authHeaders();
  const response = await fetch(
    `/api/v1/courier/jobs/${encodeURIComponent(parcelId)}/proof`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": photo.type },
      body: photo,
      credentials: "same-origin",
      cache: "no-store",
    },
  );
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const problem = payload as Partial<{ detail: string; code: string }>;
    throw new ApiError({
      type: "about:blank",
      title: "Request failed",
      status: response.status,
      detail: problem.detail ?? "The photo could not be uploaded.",
      code: problem.code ?? "REQUEST_FAILED",
      correlationId: "",
    });
  }
  return proofUploadResultSchema.parse(payload).proofObjectKey;
}
