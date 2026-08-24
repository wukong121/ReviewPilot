export type DimensionId = "performance" | "customer" | "collaboration" | "technical";

export interface ScoreInput {
  dimensions: Array<{ id: DimensionId; weight: number; scores: number[] }>;
  capabilityScores: number[];
  behaviorChecks: boolean[];
}

export interface ComputedScores {
  dimensionScores: Record<DimensionId, number>;
  weightedScore: number;
  capabilityAverage: number;
  behaviorCount: number;
}
