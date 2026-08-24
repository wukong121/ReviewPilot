import { Role, UserStatus, prisma } from "@employee-review/db";

import { normalizeEntraEmail } from "./entra-email";

interface EntraIdentity {
  oid: string;
  name?: string;
  email?: string;
  preferred_username: string;
}

export function identityEmail(identity: EntraIdentity): string | null {
  const candidates = [identity.email, identity.preferred_username];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizeEntraEmail(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export async function resolveAuthenticatedUser(identity: EntraIdentity, bootstrapObjectIds: ReadonlySet<string>) {
  const byObjectId = await prisma.user.findUnique({
    where: { entraObjectId: identity.oid },
    include: { roles: true },
  });
  if (byObjectId) {
    return byObjectId.status === UserStatus.ACTIVE ? byObjectId : null;
  }

  const email = identityEmail(identity);
  if (!email) return null;
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

  const isBootstrapAdmin = bootstrapObjectIds.has(identity.oid.toLowerCase());
  return prisma.$transaction(async (tx) => {
    const activeAdmin = isBootstrapAdmin ? await tx.user.findFirst({
      where: { status: UserStatus.ACTIVE, roles: { some: { role: Role.ADMIN } } },
      select: { id: true },
    }) : null;
    const roles = isBootstrapAdmin && !activeAdmin ? [Role.ADMIN, Role.EMPLOYEE] : [Role.EMPLOYEE];

    return tx.user.create({
      data: {
        entraObjectId: identity.oid,
        email,
        displayName: identity.name ?? identity.preferred_username,
        roles: { create: roles.map((role) => ({ role })) },
      },
      include: { roles: true },
    });
  });
}