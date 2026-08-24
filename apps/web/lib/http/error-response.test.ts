import { describe, expect, it } from "vitest";
import { z } from "zod";

import { errorResponse } from "./error-response";

describe("errorResponse", () => {
  it("returns actionable validation errors", async () => {
    const result = z.object({ email: z.string().email() }).safeParse({ email: "invalid" });
    if (result.success) throw new Error("expected validation failure");

    const response = errorResponse(result.error);
    const body = await response.json() as { error: string; correlationId: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("email:");
    expect(body.correlationId).toBeTruthy();
  });

  it("does not expose unexpected internal errors", async () => {
    const response = errorResponse(new Error("database password leaked"));
    const body = await response.json() as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("internal_error");
  });
});