import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, tx } = vi.hoisted(() => {
  const transaction = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    reviewCycle: { findUnique: vi.fn(), update: vi.fn() },
    employeeManager: { updateMany: vi.fn(), create: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  return {
    tx: transaction,
    prismaMock: { $transaction: vi.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)) },
  };
});

vi.mock("@employee-review/db", () => ({
  Prisma: {},
  Role: { EMPLOYEE: "EMPLOYEE", MANAGER: "MANAGER", ADMIN: "ADMIN" },
  TemplateStatus: { DRAFT: "DRAFT", PUBLISHED: "PUBLISHED" },
  UserStatus: { ACTIVE: "ACTIVE", INACTIVE: "INACTIVE" },
  prisma: prismaMock,
}));

import { authorizeUser, setUserActiveState, updateCycleSchedule } from "./admin-service";

describe("authorizeUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.user.findUnique.mockResolvedValue({ id: "user-1" });
    tx.user.findFirst.mockResolvedValue(null);
    tx.user.update.mockResolvedValue({ id: "user-1" });
    tx.employeeManager.updateMany.mockResolvedValue({ count: 0 });
    tx.auditEvent.create.mockResolvedValue({ id: "audit-1" });
  });

  it("updates the existing database user by stable record ID", async () => {
    await authorizeUser({
      id: "user-1",
      email: "MengHanGuo@Microsoft.com",
      displayName: "Meng Han Guo",
      roles: ["EMPLOYEE"],
    }, { id: "admin-1" });

    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: expect.objectContaining({
        email: "menghanguo@microsoft.com",
      }),
    }));
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("clears an incorrect SSO binding when requested", async () => {
    await authorizeUser({
      id: "user-1",
      email: "menghanguo@microsoft.com",
      displayName: "Meng Han Guo",
      roles: ["EMPLOYEE"],
      resetEntraBinding: true,
    }, { id: "admin-1" });

    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entraObjectId: null }),
    }));
  });

  it("returns a conflict when an identifier belongs to another user", async () => {
    tx.user.findFirst.mockResolvedValue({
      email: "menghanguo@microsoft.com",
    });

    await expect(authorizeUser({
      id: "user-1",
      email: "menghanguo@microsoft.com",
      displayName: "Meng Han Guo",
      roles: ["EMPLOYEE"],
    }, { id: "admin-1" })).rejects.toMatchObject({ status: 409 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe("setUserActiveState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.employeeManager.updateMany.mockResolvedValue({ count: 1 });
    tx.user.update.mockResolvedValue({ id: "user-1", status: "INACTIVE" });
    tx.auditEvent.create.mockResolvedValue({ id: "audit-1" });
  });

  it("deactivates a user without deleting historical data", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "user-1", status: "ACTIVE", roles: [{ role: "EMPLOYEE" }] });

    await setUserActiveState("user-1", false, { id: "admin-1" });

    expect(tx.employeeManager.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ employeeId: "user-1" }, { managerId: "user-1" }], effectiveTo: null },
    }));
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { status: "INACTIVE" } });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "USER_DEACTIVATED", entityId: "user-1" }),
    }));
  });

  it("prevents an administrator from deactivating their own account", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "admin-1", status: "ACTIVE", roles: [{ role: "ADMIN" }] });

    await expect(setUserActiveState("admin-1", false, { id: "admin-1" })).rejects.toMatchObject({ status: 409 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("preserves the last active administrator", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "admin-2", status: "ACTIVE", roles: [{ role: "ADMIN" }] });
    tx.user.count.mockResolvedValue(0);

    await expect(setUserActiveState("admin-2", false, { id: "admin-1" })).rejects.toMatchObject({ status: 409 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("restores a user without restoring expired manager relationships", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "user-1", status: "INACTIVE", roles: [{ role: "EMPLOYEE" }] });
    tx.user.update.mockResolvedValue({ id: "user-1", status: "ACTIVE" });

    await setUserActiveState("user-1", true, { id: "admin-1" });

    expect(tx.employeeManager.updateMany).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { status: "ACTIVE" } });
  });
});

describe("updateCycleSchedule", () => {
  const previousOpensAt = new Date("2026-09-01T00:00:00.000Z");
  const previousDueAt = new Date("2026-09-30T00:00:00.000Z");
  const opensAt = new Date("2026-09-02T00:00:00.000Z");
  const dueAt = new Date("2026-10-07T00:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    tx.reviewCycle.findUnique.mockResolvedValue({ id: "cycle-1", status: "OPEN", opensAt: previousOpensAt, dueAt: previousDueAt });
    tx.reviewCycle.update.mockResolvedValue({ id: "cycle-1", opensAt, dueAt });
    tx.auditEvent.create.mockResolvedValue({ id: "audit-1" });
  });

  it("updates an open cycle schedule and audits previous values", async () => {
    await updateCycleSchedule("cycle-1", opensAt, dueAt, { id: "admin-1" });

    expect(tx.reviewCycle.update).toHaveBeenCalledWith({ where: { id: "cycle-1" }, data: { opensAt, dueAt } });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "CYCLE_SCHEDULE_UPDATED",
        metadataJson: expect.objectContaining({ previousDueAt: previousDueAt.toISOString(), dueAt: dueAt.toISOString() }),
      }),
    }));
  });

  it.each(["CLOSED", "ARCHIVED"])("rejects schedule changes for a %s cycle", async (status) => {
    tx.reviewCycle.findUnique.mockResolvedValue({ id: "cycle-1", status, opensAt: previousOpensAt, dueAt: previousDueAt });

    await expect(updateCycleSchedule("cycle-1", opensAt, dueAt, { id: "admin-1" })).rejects.toMatchObject({ status: 409 });
    expect(tx.reviewCycle.update).not.toHaveBeenCalled();
  });

  it("rejects a due time before the open time", async () => {
    await expect(updateCycleSchedule("cycle-1", dueAt, opensAt, { id: "admin-1" })).rejects.toMatchObject({ status: 400 });
    expect(tx.reviewCycle.findUnique).not.toHaveBeenCalled();
  });
});