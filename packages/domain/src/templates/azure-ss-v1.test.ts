import { describe, expect, it } from "vitest";

import { azureSsTemplateV1 } from "./azure-ss-v1";

describe("Azure SS template v1", () => {
  it("matches the source document", () => {
    expect(azureSsTemplateV1.dimensions).toHaveLength(4);
    expect(azureSsTemplateV1.dimensions.flatMap((dimension) => dimension.questions)).toHaveLength(20);
    expect(azureSsTemplateV1.dimensions.flatMap((dimension) => [
      dimension.bestThingQuestion,
      dimension.improvementQuestion,
    ])).toHaveLength(8);
    expect(azureSsTemplateV1.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)).toBeCloseTo(1);
    expect(azureSsTemplateV1.capabilities).toHaveLength(7);
    expect(azureSsTemplateV1.behaviors).toHaveLength(9);
    expect(azureSsTemplateV1.openQuestions).toHaveLength(6);
    expect(azureSsTemplateV1.preparationChecks).toHaveLength(4);
  });

  it("uses stable unique field identifiers", () => {
    const ids = [
      ...azureSsTemplateV1.dimensions.flatMap((dimension) => [
        ...dimension.questions.map((question) => question.id),
        dimension.bestThingQuestion.id,
        dimension.improvementQuestion.id,
      ]),
      ...azureSsTemplateV1.capabilities.map((field) => field.id),
      ...azureSsTemplateV1.behaviors.map((field) => field.id),
      ...azureSsTemplateV1.openQuestions.map((field) => field.id),
      ...azureSsTemplateV1.preparationChecks.map((field) => field.id),
    ];

    expect(new Set(ids).size).toBe(ids.length);
  });
});