import { Role, UserStatus, prisma } from "@employee-review/db";

interface EntraIdentity {
  oid: string;
  name?: string;
  email?: string;
  preferred_username: string;
}

export async function resolveAuthenticatedUser(identity: EntraIdentity, bootstrapObjectIds: ReadonlySet<string>) {
  const byObjectId = await prisma.user.findUnique({
    where: { entraObjectId: identity.oid },
    include: { roles: true },
  });
  if (byObjectId) {
    return byObjectId.status === UserStatus.ACTIVE ? byObjectId : null;
  }

  const email = (identity.email ?? identity.preferred_username).toLowerCase();
  const byEmail = await prisma.user.findUnique({ where: { email }, include: { roles: true } });
  if (byEmail) {
    if (byEmail.status !== UserStatus.ACTIVE || byEmail.entraObjectId !== null) return null;
    const bound = await prisma.user.updateMany({
      where: { id: byEmail.id, entraObjectId: null },
      data: { entraObjectId: identity.oid, ...(identity.name ? { displayName: identity.name } : {}) },
    });
    if (bound.count !== 1) return null;
    return prisma.user.findUnique({ where: { entraObjectId: identity.oid }, include: { roles: true } });
  }

  if (!bootstrapObjectIds.has(identity.oid.toLowerCase())) return null;
  return prisma.$transaction(async (tx) => {
    const activeAdmin = await tx.user.findFirst({
      where: { status: UserStatus.ACTIVE, roles: { some: { role: Role.ADMIN } } },
      select: { id: true },
    });
    if (activeAdmin) return null;

    return tx.user.create({
      data: {
        entraObjectId: identity.oid,
        email,
        displayName: identity.name ?? identity.preferred_username,
        roles: { create: [{ role: Role.ADMIN }, { role: Role.EMPLOYEE }] },
      },
      include: { roles: true },
    });
  });
}