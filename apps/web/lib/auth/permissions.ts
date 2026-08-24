export type Role = "EMPLOYEE" | "MANAGER" | "ADMIN";

export type Permission =
  | "review:read"
  | "review:edit-own"
  | "review:decide"
  | "analytics:read"
  | "admin:manage-users"
  | "admin:manage-templates"
  | "admin:manage-cycles"
  | "admin:retry-jobs"
  | "admin:read-audit";

export interface Actor {
  id: string;
  roles: readonly Role[];
}

export interface PermissionResource {
  employeeId?: string;
  approverManagerId?: string;
}

const ADMIN_PERMISSIONS = new Set<Permission>([
  "analytics:read",
  "admin:manage-users",
  "admin:manage-templates",
  "admin:manage-cycles",
  "admin:retry-jobs",
  "admin:read-audit",
]);

export function can(actor: Actor, permission: Permission, resource: PermissionResource = {}): boolean {
  if (permission === "review:decide") {
    return actor.roles.includes("MANAGER") && resource.approverManagerId === actor.id;
  }

  if (permission === "review:read") {
    return (
      actor.roles.includes("MANAGER") ||
      actor.roles.includes("ADMIN") ||
      (actor.roles.includes("EMPLOYEE") && resource.employeeId === actor.id)
    );
  }

  if (permission === "review:edit-own") {
    return actor.roles.includes("EMPLOYEE") && resource.employeeId === actor.id;
  }

  if (permission === "analytics:read") {
    return actor.roles.includes("MANAGER") || actor.roles.includes("ADMIN");
  }

  return actor.roles.includes("ADMIN") && ADMIN_PERMISSIONS.has(permission);
}
