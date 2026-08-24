import { describe, expect, it } from "vitest";
import { redact } from "./env";

describe("redact", () => {
  it("recursively redacts credentials and sensitive bodies", () => {
    expect(redact({ apiKey: "secret", reviewVersionId: "v1", nested: { accessToken: "token", prompt: "private" } }))
      .toEqual({ apiKey: "[REDACTED]", reviewVersionId: "v1", nested: { accessToken: "[REDACTED]", prompt: "[REDACTED]" } });
  });
});