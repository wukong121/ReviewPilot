import { describe, expect, it } from "vitest";

import { GET } from "../app/api/health/route";

describe("health route", () => {
  it("returns an OK payload", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});