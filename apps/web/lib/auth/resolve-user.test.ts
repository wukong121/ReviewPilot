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
import { normalizeEntraEmail } from "./entra-email";

const identity = {
  oid: "212a9c74-1c01-42fa-94de-6865e82faf80",
  name: "Menghan Guo",
  preferred_username: "MengHanGuo@Microsoft.com",
};

describe("resolveAuthenticatedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback({
      user: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(({ data }) => ({ id: "user-new", ...data, roles: data.roles.create })) },
    }));
  });

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

  it("accepts a guest EXT user principal name when no email claim is present", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const user = await resolveAuthenticatedUser({
      ...identity,
      preferred_username: "menghanguo_microsoft.com#EXT#@fdpo.onmicrosoft.com",
    }, new Set());

    expect(user).toEqual(expect.objectContaining({ email: "menghanguo@microsoft.com" }));
  });

  it("creates an unknown tenant user with the employee role", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const user = await resolveAuthenticatedUser(identity, new Set());

    expect(user).toEqual(expect.objectContaining({
      entraObjectId: identity.oid,
      roles: [{ role: "EMPLOYEE" }],
    }));
  });
});

describe("normalizeEntraEmail", () => {
  it("decodes a Guest EXT UPN to the external mailbox", () => {
    expect(normalizeEntraEmail("menghanguo_microsoft.com#EXT#@fdpo.onmicrosoft.com")).toBe("menghanguo@microsoft.com");
  });

  it("rejects identifiers that are neither an email nor a Guest UPN", () => {
    expect(normalizeEntraEmail("not-an-identity")).toBeNull();
  });
});