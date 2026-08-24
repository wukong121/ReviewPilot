import { Role, UserStatus } from "@employee-review/db";
import NextAuth, { customFetch } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { z } from "zod";

import { prisma } from "@employee-review/db";
import { createEntraCertificateFetch } from "./lib/auth/entra-certificate";

const EntraProfileSchema = z.object({
  oid: z.string().uuid(),
  tid: z.string().uuid(),
  name: z.string().min(1).optional(),
  preferred_username: z.string().email(),
});

function productionValue(name: string): string {
  const value = process.env[name];
  const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (!value && process.env.NODE_ENV === "production" && !isProductionBuild) {
    throw new Error(`${name} is required in production`);
  }
  return value ?? `build-placeholder-${name.toLowerCase()}`;
}

const tenantId = productionValue("ENTRA_TENANT_ID");
const clientId = productionValue("ENTRA_CLIENT_ID");
const certificateBase64 = process.env.ENTRA_CLIENT_CERTIFICATE_BASE64;
const privateKeyBase64 = process.env.ENTRA_CLIENT_PRIVATE_KEY_BASE64;
if (Boolean(certificateBase64) !== Boolean(privateKeyBase64)) {
  throw new Error("ENTRA_CLIENT_CERTIFICATE_BASE64 and ENTRA_CLIENT_PRIVATE_KEY_BASE64 must be configured together");
}

const entraProvider = certificateBase64 && privateKeyBase64
  ? MicrosoftEntraID({
      clientId,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      client: { token_endpoint_auth_method: "none" },
      [customFetch]: createEntraCertificateFetch({
        tenantId,
        clientId,
        certificatePem: Buffer.from(certificateBase64, "base64").toString("utf8"),
        privateKeyPem: Buffer.from(privateKeyBase64, "base64").toString("utf8"),
      }),
    })
  : MicrosoftEntraID({
      clientId,
      clientSecret: productionValue("ENTRA_CLIENT_SECRET"),
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    });
const bootstrapObjectIds = new Set(
  (process.env.BOOTSTRAP_ADMIN_OBJECT_IDS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

async function findOrBootstrapUser(profile: z.infer<typeof EntraProfileSchema>) {
  const existing = await prisma.user.findUnique({
    where: { entraObjectId: profile.oid },
    include: { roles: true },
  });
  if (existing?.status === UserStatus.ACTIVE) {
    return existing;
  }
  if (existing || !bootstrapObjectIds.has(profile.oid.toLowerCase())) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const activeAdmin = await tx.user.findFirst({
      where: { status: UserStatus.ACTIVE, roles: { some: { role: Role.ADMIN } } },
      select: { id: true },
    });
    if (activeAdmin) {
      return null;
    }

    return tx.user.create({
      data: {
        entraObjectId: profile.oid,
        email: profile.preferred_username.toLowerCase(),
        displayName: profile.name ?? profile.preferred_username,
        roles: { create: [{ role: Role.ADMIN }, { role: Role.EMPLOYEE }] },
      },
      include: { roles: true },
    });
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: productionValue("AUTH_SECRET"),
  providers: [entraProvider],
  pages: { error: "/unauthorized" },
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile }) {
      const parsed = EntraProfileSchema.safeParse(profile);
      if (!parsed.success || parsed.data.tid.toLowerCase() !== tenantId.toLowerCase()) {
        return false;
      }
      return (await findOrBootstrapUser(parsed.data)) !== null;
    },
    async jwt({ token, profile }) {
      if (!profile && token.userId) {
        const currentUser = await prisma.user.findUnique({
          where: { id: token.userId },
          include: { roles: true },
        });
        if (!currentUser || currentUser.status !== UserStatus.ACTIVE) {
          token.userId = undefined;
          token.entraObjectId = undefined;
          token.roles = [];
          return token;
        }
        token.roles = currentUser.roles.map(({ role }) => role);
        return token;
      }
      if (!profile) {
        return token;
      }
      const parsed = EntraProfileSchema.safeParse(profile);
      if (!parsed.success) {
        return token;
      }
      const localUser = await findOrBootstrapUser(parsed.data);
      if (localUser) {
        token.userId = localUser.id;
        token.entraObjectId = localUser.entraObjectId;
        token.roles = localUser.roles.map(({ role }) => role);
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.userId && token.entraObjectId && token.roles) {
        session.user.userId = token.userId;
        session.user.entraObjectId = token.entraObjectId;
        session.user.roles = token.roles;
      }
      return session;
    },
  },
});
