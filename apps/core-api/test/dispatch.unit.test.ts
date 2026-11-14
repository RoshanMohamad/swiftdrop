import { describe, expect, it, jest } from "@jest/globals";
import type { Database } from "@swiftdrop/db";
import { DispatchService } from "../src/modules/dispatch/service.js";

const parcel = {
  id: "11111111-1111-4111-8111-111111111111",
  trackingNumber: "SDABC12345",
  status: "CREATED",
  version: 1,
  dispatchVersion: 1,
  originZoneId: 7,
  createdAt: new Date("2026-11-13T10:00:00.000Z"),
  originZone: { town: "Colombo" },
  destinationZone: { town: "Kandy" },
  quote: { weightGrams: 500 },
};

const profile = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userId: 12,
  onDuty: true,
  maxCapacity: 3,
  currentWorkload: 1,
  user: { id: 12, fullName: "Courier One", roleId: "COURIER", status: "ACTIVE" },
  assignments: [],
};

describe("DispatchService", () => {
  it("returns created parcels FIFO and filters by pickup zone", async () => {
    const findMany = jest.fn(async (_args: unknown) => [parcel]);
    const db = { parcel: { findMany } } as unknown as Database;

    const result = await new DispatchService(db).listUnassigned({
      pickupZoneId: 7,
      limit: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "CREATED",
          originZoneId: 7,
          assignments: { none: { status: "ACTIVE" } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 20,
      }),
    );
    expect(result.items[0]).toMatchObject({
      id: parcel.id,
      originZoneId: 7,
      originTown: "Colombo",
      destinationTown: "Kandy",
    });
  });

  it("reports available capacity and utilization for courier profiles", async () => {
    const findMany = jest.fn(async (_args: unknown) => [profile]);
    const db = { courierProfile: { findMany } } as unknown as Database;

    const result = await new DispatchService(db).listCourierCapacity();

    expect(result.items[0]).toMatchObject({
      courierUserId: 12,
      maxCapacity: 3,
      currentWorkload: 1,
      availableCapacity: 2,
      utilizationPercent: 33.3,
    });
  });

  it("rejects assignment when the target courier has no capacity", async () => {
    const tx = {
      parcel: {
        findUnique: jest.fn(async () => ({
          id: parcel.id,
          status: "CREATED",
          version: 1,
          dispatchVersion: 1,
          assignments: [],
        })),
      },
      courierProfile: {
        findUnique: jest.fn(async () => ({
          ...profile,
          currentWorkload: 3,
          maxCapacity: 3,
        })),
        findUniqueOrThrow: jest.fn(async () => ({
          ...profile,
          currentWorkload: 3,
          maxCapacity: 3,
        })),
      },
      $queryRaw: jest.fn(async () => []),
    };
    const db = {
      $transaction: async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
    } as unknown as Database;

    await expect(
      new DispatchService(db).assign(parcel.id, {
        courierUserId: 12,
        dispatchVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "COURIER_CAPACITY_EXCEEDED" });
  });

  it("rejects a stale dispatch revision before changing courier state", async () => {
    const tx = {
      parcel: {
        findUnique: jest.fn(async () => ({
          id: parcel.id,
          status: "CREATED",
          version: 1,
          dispatchVersion: 2,
          assignments: [],
        })),
        update: jest.fn(),
      },
      $queryRaw: jest.fn(async () => []),
    };
    const db = {
      $transaction: async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
    } as unknown as Database;

    await expect(
      new DispatchService(db).assign(parcel.id, {
        courierUserId: 12,
        dispatchVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(tx.parcel.update).not.toHaveBeenCalled();
  });

  it("locks courier rows in sorted order and moves workload on reassignment", async () => {
    const lockIds: string[] = [];
    const target = { ...profile, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    const current = {
      id: "22222222-2222-4222-8222-222222222222",
      parcelId: parcel.id,
      courierProfileId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "ACTIVE",
      assignedAt: new Date("2026-11-13T10:01:00.000Z"),
      releasedAt: null,
    };
    const tx = {
      parcel: {
        findUnique: jest.fn(async () => ({
          id: parcel.id,
          status: "CREATED",
          version: 1,
          dispatchVersion: 1,
          assignments: [current],
        })),
        update: jest.fn(async (_args: unknown) => ({ dispatchVersion: 2 })),
      },
      courierProfile: {
        findUnique: jest.fn(async () => target),
        findUniqueOrThrow: jest.fn(async () => target),
        update: jest.fn(async (_args: unknown) => undefined),
      },
      courierAssignment: {
        update: jest.fn(async (_args: unknown) => undefined),
        create: jest.fn(async (_args: unknown) => ({
          id: "33333333-3333-4333-8333-333333333333",
          parcelId: parcel.id,
          status: "ACTIVE",
          assignedAt: new Date("2026-11-13T10:02:00.000Z"),
          releasedAt: null,
        })),
      },
      $queryRaw: jest.fn(async (_query: unknown, id: string) => {
        if (id.startsWith("a") || id.startsWith("b")) lockIds.push(id);
        return [];
      }),
    };
    const db = {
      $transaction: async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
    } as unknown as Database;

    const result = await new DispatchService(db).assign(parcel.id, {
      courierUserId: 12,
      dispatchVersion: 1,
    });

    expect(lockIds).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]);
    expect(tx.courierAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: current.id } }),
    );
    expect(tx.courierAssignment.create).toHaveBeenCalledWith({
      data: { parcelId: parcel.id, courierProfileId: target.id },
    });
    expect(tx.parcel.update).toHaveBeenCalledWith({
      where: { id: parcel.id },
      data: { dispatchVersion: { increment: 1 } },
      select: { dispatchVersion: true },
    });
    expect(result).toMatchObject({
      parcelId: parcel.id,
      courierUserId: target.userId,
      dispatchVersion: 2,
      status: "ACTIVE",
    });
  });
});
