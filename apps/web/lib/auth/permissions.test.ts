import { describe, expect, it } from "vitest";

import { can } from "./permissions";

describe("authorization policy", () => {
  it("prevents an employee from reading a coworker's review", () => {
    expect(can({ id: "e1", roles: ["EMPLOYEE"] }, "review:read", { employeeId: "e2" })).toBe(false);
  });

  it("lets an employee read and edit only their own review", () => {
    const employee = { id: "e1", roles: ["EMPLOYEE"] as const };
    expect(can(employee, "review:read", { employeeId: "e1" })).toBe(true);
    expect(can(employee, "review:edit-own", { employeeId: "e1" })).toBe(true);
    expect(can(employee, "review:edit-own", { employeeId: "e2" })).toBe(false);
  });

  it("lets managers read every review but only the approver decide", () => {
    const manager = { id: "m1", roles: ["MANAGER"] as const };
    expect(can(manager, "review:read", { employeeId: "e2", approverManagerId: "m2" })).toBe(true);
    expect(can(manager, "review:decide", { employeeId: "e2", approverManagerId: "m2" })).toBe(false);
    expect(can(manager, "review:decide", { employeeId: "e2", approverManagerId: "m1" })).toBe(true);
  });

  it("never exposes analytics to employees", () => {
    expect(can({ id: "e1", roles: ["EMPLOYEE"] }, "analytics:read")).toBe(false);
  });

  it("allows admins to manage but not approve", () => {
    const admin = { id: "a1", roles: ["ADMIN"] as const };
    expect(can(admin, "admin:manage-users")).toBe(true);
    expect(can(admin, "review:decide", { approverManagerId: "a1" })).toBe(false);
  });
});
