import { describe, expect, it } from "vitest";

import { AiSummarySchema } from "./summary-schema";

const validSummary = {
  overallSummary: "总体表现稳定，重点机会推进有据可查。",
  dimensionSummaries: ["performance", "customer", "collaboration", "technical"].map((dimensionId) => ({
    dimensionId,
    conclusion: "表现符合预期。",
    evidenceQuestionIds: [`${dimensionId}.evidence`],
  })),
  strengths: [{ title: "推进能力", description: "主动推进重点机会。", evidenceQuestionIds: ["performance.stuck-deals"] }],
  improvements: [{ title: "量化价值", action: "补充 ROI 数据。", evidenceQuestionIds: ["customer.business-language"] }],
  managerDiscussionTopics: ["重点客户推进节奏"],
  supportNeeds: ["跨团队技术资源"],
  caveats: [],
};

describe("AiSummarySchema", () => {
  it("accepts an evidence-linked four-dimensional summary", () => {
    expect(AiSummarySchema.parse(validSummary)).toEqual(validSummary);
  });

  it("requires evidence IDs for strengths and improvements", () => {
    expect(() => AiSummarySchema.parse({
      ...validSummary,
      strengths: [{ title: "推进能力", description: "主动推进", evidenceQuestionIds: [] }],
    })).toThrow();
  });

  it("rejects prohibited decision recommendations", () => {
    expect(() => AiSummarySchema.parse({ ...validSummary, compensationRecommendation: "加薪" })).toThrow();
  });
});
