import { describe, expect, it, jest } from "@jest/globals";
import {
  bookingRequestSchema,
  courierJobsSchema,
  merchantOrderRequestSchema,
  merchantRegistrationSchema,
} from "@swiftdrop/contracts";
import { CourierService } from "../src/modules/courier/service.js";

const booking = {
  quoteId: "2c1b6f7e-9d0f-4a7e-8d52-0b2c8f3e1a11",
  recipientName: "Kamal Perera",
  recipientPhone: "0771234567",
  recipientAddress: "12 Temple Road, Kandy",
};
const pickup = {
  pickupAddress: "5 Galle Road, Colombo 03",
  pickupContactName: "Nimal Silva",
  pickupContactPhone: "0711112222",
};
const order = {
  originDistrict: "Colombo",
  destinationDistrict: "Kandy",
  weightGrams: 2000,
  lengthMm: 200,
  widthMm: 150,
  heightMm: 100,
  recipientName: "Kamal Perera",
  recipientPhone: "0771234567",
  recipientAddress: "12 Temple Road, Kandy",
};

describe("pickup and item fields on bookings", () => {
  it("stays valid with none of the new fields (additive v1 change)", () => {
    expect(bookingRequestSchema.safeParse(booking).success).toBe(true);
    expect(merchantOrderRequestSchema.safeParse(order).success).toBe(true);
  });

  it("normalises the pickup phone like the recipient phone", () => {
    const parsed = bookingRequestSchema.parse({ ...booking, ...pickup });
    expect(parsed.pickupContactPhone).toBe("+94711112222");
  });

  it("requires the three pickup fields together", () => {
    for (const key of Object.keys(pickup)) {
      const partial = { ...pickup } as Record<string, string>;
      delete partial[key];
      expect(
        bookingRequestSchema.safeParse({ ...booking, ...partial }).success,
      ).toBe(false);
      expect(
        merchantOrderRequestSchema.safeParse({ ...order, ...partial }).success,
      ).toBe(false);
    }
    expect(
      merchantOrderRequestSchema.safeParse({ ...order, ...pickup }).success,
    ).toBe(true);
  });

  it.each([
    ["a bad pickup phone", { pickupContactPhone: "12345" }],
    [
      "a control character in the address",
      { pickupAddress: "Road\u0000 1, Colombo" },
    ],
    ["an address that is too short", { pickupAddress: "abc" }],
  ])("rejects %s", (_name, override) => {
    expect(
      bookingRequestSchema.safeParse({ ...booking, ...pickup, ...override })
        .success,
    ).toBe(false);
  });

  it.each([
    ["an unknown handling note", { handlingNote: "SHAKE_WELL" }],
    ["a float declared value", { declaredValueCents: 10.5 }],
    ["a negative declared value", { declaredValueCents: -1 }],
    ["an impossible date", { preferredPickupDate: "2026-02-31" }],
    ["a malformed date", { preferredPickupDate: "02/03/2026" }],
    ["an over-long description", { itemDescription: "x".repeat(201) }],
    ["an unknown field", { insured: true }],
  ])("rejects %s", (_name, override) => {
    expect(
      bookingRequestSchema.safeParse({ ...booking, ...override }).success,
    ).toBe(false);
  });

  it("accepts every handling note on the fixed list", () => {
    for (const handlingNote of [
      "FRAGILE",
      "KEEP_DRY",
      "THIS_WAY_UP",
      "HANDLE_WITH_CARE",
    ])
      expect(
        bookingRequestSchema.safeParse({ ...booking, handlingNote }).success,
      ).toBe(true);
  });

  it("accepts an optional default pickup at merchant registration, all or none", () => {
    const registration = {
      fullName: "Shop Owner",
      email: "owner@example.test",
      phone: "0771234567",
      password: "a-long-passphrase-for-tests-1",
      businessName: "Shop",
    };
    expect(merchantRegistrationSchema.safeParse(registration).success).toBe(
      true,
    );
    expect(
      merchantRegistrationSchema.safeParse({ ...registration, ...pickup })
        .success,
    ).toBe(true);
    expect(
      merchantRegistrationSchema.safeParse({
        ...registration,
        pickupAddress: pickup.pickupAddress,
      }).success,
    ).toBe(false);
  });
});

describe("courier jobs carry pickup details only through the ownership query", () => {
  it("returns the pickup fields of the courier's own assigned parcel", async () => {
    const findMany = jest.fn(async (_query: unknown) => [
      {
        assignedAt: new Date("2026-11-19T10:00:00.000Z"),
        parcel: {
          id: "2c1b6f7e-9d0f-4a7e-8d52-0b2c8f3e1a11",
          trackingNumber: "SD-7KQ2M9XA-P",
          status: "CREATED",
          version: 2,
          attemptCount: 0,
          recipientName: "Recipient",
          recipientPhone: "0771234567",
          recipientAddress: "Kandy",
          pickupAddress: "5 Galle Road, Colombo 03",
          pickupContactName: "Nimal Silva",
          pickupContactPhone: "+94711112222",
          itemDescription: "Boxed shirts",
          handlingNote: "FRAGILE",
          preferredPickupDate: new Date("2026-12-01T00:00:00.000Z"),
          originZone: { town: "Colombo" },
          destinationZone: { town: "Kandy" },
        },
      },
    ]);
    const service = new CourierService(
      {
        user: {
          findUnique: jest.fn(async () => ({
            fullName: "Courier One",
            courierProfile: { onDuty: true, capacity: 10, workload: 1 },
          })),
        },
        parcelAssignment: { findMany },
      } as never,
      {} as never,
      {} as never,
    );

    const jobs = courierJobsSchema.parse(await service.jobs(7));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ courierId: 7, releasedAt: null }),
      }),
    );
    expect(jobs.items[0]).toMatchObject({
      pickupAddress: "5 Galle Road, Colombo 03",
      pickupContactName: "Nimal Silva",
      pickupContactPhone: "+94711112222",
      itemDescription: "Boxed shirts",
      handlingNote: "FRAGILE",
      preferredPickupDate: "2026-12-01",
    });
  });
});
