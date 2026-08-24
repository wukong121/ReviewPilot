import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, tx } = vi.hoisted(() => {
  const transaction = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
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
  UserStatus: { ACTIVE: "ACTIVE" },
  prisma: prismaMock,
}));

import { authorizeUser } from "./admin-service";

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