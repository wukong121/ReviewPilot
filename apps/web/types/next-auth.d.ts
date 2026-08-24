import type { DefaultSession } from "next-auth";
import type { JWT } from "next-auth/jwt";

import type { Role } from "../lib/auth/permissions";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      userId: string;
      entraObjectId: string;
      roles: Role[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    entraObjectId?: string;
    roles?: Role[];
  }
}
