import { describe, expect, it } from "vitest";

import { assertTransition } from "./state-machine";

describe("review state machine", () => {
  it.each([
    ["DRAFT", "AI_PROCESSING"],
    ["REVISION_DRAFT", "AI_PROCESSING"],
    ["AI_PROCESSING", "PENDING_REVIEW"],
    ["PENDING_REVIEW", "APPROVED"],
    ["PENDING_REVIEW", "REJECTED"],
  ] as const)("allows %s to %s", (from, to) => {
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it("rejects editing an approved version", () => {
    expect(() => assertTransition("APPROVED", "DRAFT")).toThrow(
      "invalid review transition",
    );
  });
});
