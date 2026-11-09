import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Client } from "minio";
import { Prisma, type Database } from "@swiftdrop/db";
import { HttpError } from "../../shared/problem.js";
import type { Config } from "../../shared/config.js";

const linkLifetimeSeconds = 300;
const receiptInclude = {
  user: { select: { email: true, fullName: true } },
  quote: {
    select: {
      weightGrams: true,
      lengthMm: true,
      widthMm: true,
      heightMm: true,
    },
  },
  originZone: { select: { town: true } },
  destinationZone: { select: { town: true } },
  history: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    take: 100,
  },
  receipt: true,
};

type ReceiptParcel = Prisma.ParcelGetPayload<{ include: typeof receiptInclude }>;

export class ReceiptService {
  private readonly storage: Client;

  constructor(
    private readonly db: Database,
    private readonly config: Config,
  ) {
    const endpoint = new URL(config.MINIO_ENDPOINT);
    this.storage = new Client({
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

  async generateForDelivered(parcelId: string) {
    const parcel = await this.findParcel(parcelId);
    if (parcel.status !== "DELIVERED") return null;
    if (parcel.receipt) return parcel.receipt;

    await this.ensureBucket();
    const objectKey = `receipts/${parcel.id}.pdf`;
    const pdf = await this.createPdf(parcel);
    await this.storage.putObject(this.config.MINIO_BUCKET, objectKey, pdf, pdf.length, {
      "Content-Type": "application/pdf",
    });
    try {
      return await this.db.receipt.create({
        data: {
          parcelId: parcel.id,
          reference: `SDR-${parcel.trackingNumber}`,
          objectKey,
          generatedAt: new Date(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.db.receipt.findUnique({
          where: { parcelId: parcel.id },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async getDownloadUrl(userId: number, parcelId: string) {
    const parcel = await this.db.parcel.findFirst({
      where: { id: parcelId, userId },
      include: receiptInclude,
    });
    if (!parcel)
      throw new HttpError(404, "PARCEL_NOT_FOUND", "This booking is not available.");
    if (parcel.status !== "DELIVERED")
      throw new HttpError(
        409,
        "RECEIPT_UNAVAILABLE",
        "A delivery receipt is available after this parcel is delivered.",
      );

    let receipt = parcel.receipt;
    if (receipt) {
      try {
        await this.storage.statObject(this.config.MINIO_BUCKET, receipt.objectKey);
      } catch {
        receipt = null;
      }
    }
    if (!receipt) receipt = await this.generateForDelivered(parcel.id);
    if (!receipt)
      throw new HttpError(503, "RECEIPT_UNAVAILABLE", "The receipt is not available yet.");
    const downloadUrl = await this.storage.presignedGetObject(
      this.config.MINIO_BUCKET,
      receipt.objectKey,
      linkLifetimeSeconds,
    );
    return {
      receiptReference: receipt.reference,
      downloadUrl,
      expiresAt: new Date(Date.now() + linkLifetimeSeconds * 1000).toISOString(),
    };
  }

  private async findParcel(parcelId: string): Promise<ReceiptParcel> {
    const parcel = await this.db.parcel.findUnique({
      where: { id: parcelId },
      include: receiptInclude,
    });
    if (!parcel)
      throw new HttpError(404, "PARCEL_NOT_FOUND", "Parcel not found.");
    return parcel;
  }

  private async ensureBucket() {
    if (!(await this.storage.bucketExists(this.config.MINIO_BUCKET)))
      await this.storage.makeBucket(this.config.MINIO_BUCKET, "us-east-1");
  }

  private async createPdf(parcel: ReceiptParcel) {
    const document = await PDFDocument.create();
    const page = document.addPage([595.28, 841.89]);
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const dark = rgb(0.1, 0.22, 0.17);
    const muted = rgb(0.35, 0.42, 0.38);
    let y = 780;
    const text = (
      value: string,
      x: number,
      size = 11,
      font = regular,
      color = dark,
    ) => {
      page.drawText(value, { x, y, size, font, color });
      y -= size + 8;
    };
    text("SwiftDrop.", 54, 25, bold);
    text("DELIVERY RECEIPT", 54, 13, bold, muted);
    y -= 18;
    text(`Receipt reference: SDR-${parcel.trackingNumber}`, 54, 10, regular, muted);
    text(`Generated: ${new Date().toISOString()}`, 54, 10, regular, muted);
    y -= 18;
    page.drawLine({
      start: { x: 54, y },
      end: { x: 541, y },
      thickness: 1,
      color: rgb(0.75, 0.8, 0.76),
    });
    y -= 28;
    text(`Tracking number: ${parcel.trackingNumber}`, 54, 12, bold);
    text(`Booking date: ${parcel.createdAt.toISOString()}`, 54);
    const delivered = parcel.history.find((item) => item.status === "DELIVERED");
    text(`Delivered: ${delivered?.createdAt.toISOString() ?? "Recorded delivery"}`, 54);
    y -= 12;
    text("ROUTE", 54, 11, bold, muted);
    text(`${parcel.originZone.town} -> ${parcel.destinationZone.town}`, 54, 12, bold);
    y -= 12;
    text("RECIPIENT", 54, 11, bold, muted);
    text(parcel.recipientName, 54, 12, bold);
    text(parcel.recipientAddress, 54);
    text(parcel.user.fullName ?? parcel.user.email, 54, 10, regular, muted);
    y -= 12;
    text("PARCEL", 54, 11, bold, muted);
    text(`Weight: ${(parcel.quote.weightGrams / 1000).toFixed(2)} kg`, 54);
    text(
      `Dimensions: ${parcel.quote.lengthMm} x ${parcel.quote.widthMm} x ${parcel.quote.heightMm} mm`,
      54,
    );
    y -= 12;
    text("DELIVERY CHARGE", 54, 11, bold, muted);
    text(`LKR ${(parcel.feeCents / 100).toFixed(2)}`, 54, 18, bold);
    y -= 20;
    text(
      "This receipt records the completed delivery using SwiftDrop parcel records.",
      54,
      9,
      regular,
      muted,
    );
    return Buffer.from(await document.save());
  }
}
