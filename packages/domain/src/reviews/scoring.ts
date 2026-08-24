import type { ComputedScores, DimensionId, ScoreInput } from "./types";

const DIMENSION_IDS: DimensionId[] = [
  "performance",
  "customer",
  "collaboration",
  "technical",
];

function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function validateScores(scores: number[]): void {
  for (const score of scores) {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error("score must be between 1 and 5");
    }
  }
}

function average(scores: number[]): number {
  if (scores.length === 0) {
    throw new Error("at least one score is required");
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function computeScores(input: ScoreInput): ComputedScores {
  validateScores(input.capabilityScores);
  input.dimensions.forEach((dimension) => validateScores(dimension.scores));

  if (input.dimensions.length !== DIMENSION_IDS.length) {
    throw new Error("exactly four dimensions are required");
  }

  const dimensionsById = new Map(input.dimensions.map((dimension) => [dimension.id, dimension]));
  if (dimensionsById.size !== DIMENSION_IDS.length || DIMENSION_IDS.some((id) => !dimensionsById.has(id))) {
    throw new Error("all required dimensions must be unique");
  }

  const dimensionScores = Object.fromEntries(
    DIMENSION_IDS.map((id) => [id, roundToOneDecimal(average(dimensionsById.get(id)!.scores))]),
  ) as Record<DimensionId, number>;
  const weightedScore = input.dimensions.reduce(
    (sum, dimension) => sum + average(dimension.scores) * dimension.weight,
    0,
  );

  return {
    dimensionScores,
    weightedScore: roundToOneDecimal(weightedScore),
    capabilityAverage: roundToOneDecimal(average(input.capabilityScores)),
    behaviorCount: input.behaviorChecks.filter(Boolean).length,
  };
}
