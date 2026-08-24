import { can, type Permission, type PermissionResource } from "./permissions";
import { getSessionUser } from "./session-user";

export class AuthenticationError extends Error {
  readonly status = 401;
}

export class AuthorizationError extends Error {
  readonly status = 403;
}

export async function requirePermission(
  permission: Permission,
  resource?: PermissionResource,
) {
  const actor = await getSessionUser();
  if (!actor) {
    throw new AuthenticationError("authentication required");
  }
  if (!can(actor, permission, resource)) {
    throw new AuthorizationError("forbidden");
  }
  return actor;
}
