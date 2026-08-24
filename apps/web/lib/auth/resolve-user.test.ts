import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@employee-review/db", () => ({
  Role: { EMPLOYEE: "EMPLOYEE", ADMIN: "ADMIN" },
  UserStatus: { ACTIVE: "ACTIVE" },
  prisma: prismaMock,
}));

import { resolveAuthenticatedUser } from "./resolve-user";

const identity = {
  oid: "212a9c74-1c01-42fa-94de-6865e82faf80",
  name: "Menghan Guo",
  preferred_username: "MengHanGuo@Microsoft.com",
};

describe("resolveAuthenticatedUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("binds an email-preauthorized user to the first Entra Object ID", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "user-1", email: "menghanguo@microsoft.com", entraObjectId: null, status: "ACTIVE", roles: [] })
      .mockResolvedValueOnce({
      id: "user-1",
      email: "menghanguo@microsoft.com",
      entraObjectId: identity.oid,
      status: "ACTIVE",
      roles: [],
    });
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

    const user = await resolveAuthenticatedUser(identity, new Set());

    expect(prismaMock.user.findUnique).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { email: "menghanguo@microsoft.com" },
    }));
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1", entraObjectId: null },
      data: { entraObjectId: identity.oid, displayName: "Menghan Guo" },
    }));
    expect(user?.entraObjectId).toBe(identity.oid);
  });

  it("does not rebind an email already bound to another Object ID", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "user-1", email: "menghanguo@microsoft.com", entraObjectId: "11111111-1111-1111-1111-111111111111", status: "ACTIVE", roles: [] });

    await expect(resolveAuthenticatedUser(identity, new Set())).resolves.toBeNull();
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a concurrent login that loses the one-time binding race", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "user-1", email: "menghanguo@microsoft.com", entraObjectId: null, status: "ACTIVE", roles: [] });
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(resolveAuthenticatedUser(identity, new Set())).resolves.toBeNull();
  });

  it("prefers the token email over a guest EXT user principal name", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await resolveAuthenticatedUser({
      ...identity,
      email: "menghanguo@microsoft.com",
      preferred_username: "menghanguo_microsoft.com#EXT#@fdpo.onmicrosoft.com",
    }, new Set());

    expect(prismaMock.user.findUnique).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { email: "menghanguo@microsoft.com" },
    }));
  });
});