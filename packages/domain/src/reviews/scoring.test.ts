import { describe, expect, it } from "vitest";

import { computeScores } from "./scoring";

describe("computeScores", () => {
  it("uses the template's 40/30/20/10 weights", () => {
    const result = computeScores({
      dimensions: [
        { id: "performance", weight: 0.4, scores: [5, 4, 4, 4, 3] },
        { id: "customer", weight: 0.3, scores: [4, 4, 4, 4, 4] },
        { id: "collaboration", weight: 0.2, scores: [3, 3, 3, 3, 3] },
        { id: "technical", weight: 0.1, scores: [5, 5, 5, 5, 5] },
      ],
      capabilityScores: [4, 4, 3, 4, 5, 3, 4],
      behaviorChecks: [true, true, true, true, true, true, true, false, false],
    });

    expect(result.dimensionScores).toEqual({
      performance: 4,
      customer: 4,
      collaboration: 3,
      technical: 5,
    });
    expect(result.weightedScore).toBe(3.9);
    expect(result.capabilityAverage).toBe(3.9);
    expect(result.behaviorCount).toBe(7);
  });

  it("rejects missing and out-of-range scores", () => {
    expect(() =>
      computeScores({ dimensions: [], capabilityScores: [0], behaviorChecks: [] }),
    ).toThrow("score must be between 1 and 5");
  });

  it("requires all four weighted dimensions", () => {
    expect(() =>
      computeScores({
        dimensions: [{ id: "performance", weight: 1, scores: [3] }],
        capabilityScores: [3],
        behaviorChecks: [],
      }),
    ).toThrow("exactly four dimensions are required");
  });
});
