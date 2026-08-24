import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Prisma schema", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

  it.each([
    "User",
    "UserRole",
    "EmployeeManager",
    "Template",
    "TemplateVersion",
    "ReviewCycle",
    "Review",
    "ReviewVersion",
    "ReviewAnswer",
    "ComputedScore",
    "AiSummary",
    "Approval",
    "BackgroundJob",
    "Notification",
    "AuditEvent",
  ])("defines model %s", (model) => {
    expect(schema).toContain(`model ${model} {`);
  });

  it("enforces one review per employee and cycle", () => {
    expect(schema).toContain("@@unique([cycleId, employeeId])");
  });

  it("uses idempotency keys for background work", () => {
    expect(schema).toContain("idempotencyKey String");
    expect(schema).toContain("@unique");
  });
});