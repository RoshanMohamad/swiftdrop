import { Client } from "minio";
import type { Config } from "../../shared/config.js";

/** Private object storage for proof-of-delivery photos. Never hands out public URLs. */
export interface ProofStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class MinioProofStorage implements ProofStorage {
  private readonly client: Client;
  private ready = false;

  constructor(private readonly config: Config) {
    const endpoint = new URL(config.MINIO_ENDPOINT);
    this.client = new Client({
      endPoint: endpoint.hostname,
      port: endpoint.port
        ? Number(endpoint.port)
        : endpoint.protocol === "https:"
          ? 443
          : 80,
      useSSL: endpoint.protocol === "https:",
      accessKey: config.MINIO_ACCESS_KEY,
      secretKey: config.MINIO_SECRET_KEY,
    });
  }

  private async ensureBucket() {
    if (this.ready) return;
    if (!(await this.client.bucketExists(this.config.MINIO_BUCKET)))
      await this.client.makeBucket(this.config.MINIO_BUCKET, "us-east-1");
    this.ready = true;
  }

  async put(key: string, data: Buffer, contentType: string) {
    await this.ensureBucket();
    await this.client.putObject(
      this.config.MINIO_BUCKET,
      key,
      data,
      data.length,
      { "Content-Type": contentType },
    );
  }

  async exists(key: string) {
    try {
      await this.client.statObject(this.config.MINIO_BUCKET, key);
      return true;
    } catch {
      return false;
    }
  }
}
