import { readFile } from "node:fs/promises";
import { z } from "zod";

export type WebhookTarget = { url: string; secret: string };

/**
 * Where a merchant's webhook URL and signing secret come from. Production implementation is
 * M02's webhook configuration, read over HTTP with a service JWT (plan X-11 / X-03) and is
 * **not available yet**. Until then the worker uses no source and records SKIPPED.
 */
export interface WebhookConfigSource {
  /** Reloaded on every attempt, so a rotated secret or changed URL applies immediately. */
  get(merchantId: number): Promise<WebhookTarget | null>;
}

export class NoConfigSource implements WebhookConfigSource {
  async get() {
    return null;
  }
}

const fileSchema = z.record(
  z.string().regex(/^\d+$/),
  z.object({ url: z.string().min(1), secret: z.string().min(16) }).strict(),
);

/**
 * Development/test stand-in for M02's config: a JSON file `{"<merchantId>": {"url", "secret"}}`.
 * `loadConfig` refuses to enable it in production.
 */
export class DevFileConfigSource implements WebhookConfigSource {
  constructor(private path: string) {}
  async get(merchantId: number) {
    const parsed = fileSchema.parse(
      JSON.parse(await readFile(this.path, "utf8")),
    );
    return parsed[String(merchantId)] ?? null;
  }
}
