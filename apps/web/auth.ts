import { UserStatus } from "@employee-review/db";
import NextAuth, { customFetch } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { z } from "zod";

import { prisma } from "@employee-review/db";
import { createEntraCertificateFetch } from "./lib/auth/entra-certificate";
import { resolveAuthenticatedUser } from "./lib/auth/resolve-user";

const EntraProfileSchema = z.object({
  oid: z.string().uuid(),
  tid: z.string().uuid(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
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
      return (await resolveAuthenticatedUser(parsed.data, bootstrapObjectIds)) !== null;
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
      const localUser = await resolveAuthenticatedUser(parsed.data, bootstrapObjectIds);
      if (localUser?.entraObjectId) {
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
