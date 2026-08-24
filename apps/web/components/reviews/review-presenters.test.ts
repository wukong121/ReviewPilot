import type { AiSummary } from "@employee-review/domain";
import { describe, expect, it } from "vitest";

import { aiSummaryPresentation, approvalDecisionLabel } from "../../lib/reviews/review-presenters";

const summary: AiSummary = {
  overallSummary: "整体表现稳健。",
  dimensionSummaries: [
    { dimensionId: "performance", conclusion: "管线健康。", evidenceQuestionIds: ["performance.pipeline"] },
    { dimensionId: "customer", conclusion: "客户关系扎实。", evidenceQuestionIds: ["customer.relation"] },
    { dimensionId: "collaboration", conclusion: "协作主动。", evidenceQuestionIds: ["collaboration.team"] },
    { dimensionId: "technical", conclusion: "技术持续提升。", evidenceQuestionIds: ["technical.learning"] },
  ],
  strengths: [{ title: "客户洞察", description: "能识别关键业务问题。", evidenceQuestionIds: ["customer.relation"] }],
  improvements: [{ title: "量化价值", action: "补充 ROI 证据。", evidenceQuestionIds: ["performance.pipeline"] }],
  managerDiscussionTopics: ["下一季度重点客户"],
  supportNeeds: ["架构专家支持"],
  caveats: ["部分信息来自员工自述"],
};

describe("review presenters", () => {
  it("renders AI summary as labeled human-readable sections", () => {
    const content = aiSummaryPresentation(summary);

    expect(content.overall).toBe("整体表现稳健。");
    expect(content.strengths).toContainEqual({ title: "客户洞察", text: "能识别关键业务问题。" });
    expect(content.improvements).toContainEqual({ title: "量化价值", text: "补充 ROI 证据。" });
    expect(content.dimensions[0]).toEqual({ label: "业绩与管线管理", conclusion: "管线健康。" });
    expect(content).not.toHaveProperty("evidenceQuestionIds");
  });

  it("renders manager comments with decision history", () => {
    expect(approvalDecisionLabel("REJECTED")).toBe("驳回");
    expect(approvalDecisionLabel("APPROVED")).toBe("通过");
  });
});