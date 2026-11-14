import { describe, expect, it } from "@jest/globals";
import {
  assignParcelSchema,
  courierProfileUpdateSchema,
  courierStatusUpdateSchema,
  operationKeySchema,
} from "@swiftdrop/contracts";
import {
  isFinishedForCapacity,
  releaseReasonFor,
} from "../src/modules/dispatch/capacity.js";
import { decodeKeyset, encodeKeyset } from "../src/modules/dispatch/service.js";
import { sniffImage } from "../src/modules/courier/service.js";

const base = { town: "Kandy", version: 3 };

describe("courier status update contract (FR-K2)", () => {
  it("requires the receiver's name for DELIVERED and keeps the photo optional", () => {
    expect(
      courierStatusUpdateSchema.safeParse({ ...base, to: "DELIVERED" }).success,
    ).toBe(false);
    expect(
      courierStatusUpdateSchema.safeParse({
        ...base,
        to: "DELIVERED",
        receivedBy: "Nimal Perera",
      }).success,
    ).toBe(true);
  });

  it("requires a listed reason for FAILED", () => {
    expect(
      courierStatusUpdateSchema.safeParse({ ...base, to: "FAILED" }).success,
    ).toBe(false);
    expect(
      courierStatusUpdateSchema.safeParse({
        ...base,
        to: "FAILED",
        failureReason: "MADE_UP",
      }).success,
    ).toBe(false);
    expect(
      courierStatusUpdateSchema.safeParse({
        ...base,
        to: "FAILED",
        failureReason: "RECIPIENT_ABSENT",
      }).success,
    ).toBe(true);
  });

  it("rejects proof on other statuses, cancellation and foreign object keys", () => {
    expect(
      courierStatusUpdateSchema.safeParse({
        ...base,
        to: "IN_TRANSIT",
        receivedBy: "Someone",
      }).success,
    ).toBe(false);
    expect(
      courierStatusUpdateSchema.safeParse({ ...base, to: "CANCELLED" }).success,
    ).toBe(false);
    expect(
      courierStatusUpdateSchema.safeParse({
        ...base,
        to: "DELIVERED",
        receivedBy: "Nimal",
        proofObjectKey: "../../etc/passwd",
      }).success,
    ).toBe(false);
    expect(
      courierStatusUpdateSchema.safeParse({
        ...base,
        to: "PICKED_UP",
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("validates operation keys", () => {
    expect(operationKeySchema.safeParse("abcdefgh").success).toBe(true);
    expect(operationKeySchema.safeParse("short").success).toBe(false);
    expect(operationKeySchema.safeParse("has space in it").success).toBe(false);
  });
});

describe("dispatch contracts", () => {
  it("validates assignment and profile bodies", () => {
    expect(
      assignParcelSchema.safeParse({ courierId: 4, version: 2 }).success,
    ).toBe(true);
    expect(
      assignParcelSchema.safeParse({ courierId: 0, version: 2 }).success,
    ).toBe(false);
    expect(courierProfileUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      courierProfileUpdateSchema.safeParse({ capacity: 101 }).success,
    ).toBe(false);
    expect(
      courierProfileUpdateSchema.safeParse({ onDuty: false }).success,
    ).toBe(true);
  });

  it("round-trips the keyset cursor and rejects tampering", () => {
    const id = "2c1b6f7e-9d0f-4a7e-8d52-0b2c8f3e1a11";
    const at = new Date("2026-11-13T10:00:00.000Z");
    expect(decodeKeyset(encodeKeyset(at, id))).toEqual({ createdAt: at, id });
    expect(() => decodeKeyset("garbage")).toThrow();
    expect(() =>
      decodeKeyset(Buffer.from("x|y").toString("base64url")),
    ).toThrow();
  });
});

describe("capacity release rules (FR-D2)", () => {
  it("releases on delivery, cancellation and final failure only", () => {
    expect(isFinishedForCapacity("DELIVERED", 1)).toBe(true);
    expect(isFinishedForCapacity("CANCELLED", 0)).toBe(true);
    expect(isFinishedForCapacity("FAILED", 3)).toBe(true);
    expect(isFinishedForCapacity("FAILED", 2)).toBe(false);
    expect(isFinishedForCapacity("OUT_FOR_DELIVERY", 3)).toBe(false);
    expect(releaseReasonFor("DELIVERED")).toBe("DELIVERED");
    expect(releaseReasonFor("CANCELLED")).toBe("CANCELLED");
    expect(releaseReasonFor("FAILED")).toBe("FAILED");
  });
});

describe("proof photo sniffing (FR-K2)", () => {
  it("accepts real JPEG and PNG signatures and rejects everything else", () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe(
      "image/jpeg",
    );
    expect(
      sniffImage(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
      ),
    ).toBe("image/png");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});
