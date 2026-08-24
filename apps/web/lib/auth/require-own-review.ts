import { getSessionUser } from "./session-user";
import { requirePermission } from "./require-permission";

export async function requireOwnReviewAccess() {
  const session = await getSessionUser();
  if (!session) {
    return requirePermission("review:read", { employeeId: "anonymous" });
  }
  return requirePermission("review:read", { employeeId: session.id });
}
