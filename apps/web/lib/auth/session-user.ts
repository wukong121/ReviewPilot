import { auth } from "../../auth";
import type { Actor } from "./permissions";

export async function getSessionUser(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.userId) {
    return null;
  }

  return { id: session.user.userId, roles: session.user.roles };
}
