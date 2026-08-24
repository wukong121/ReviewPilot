import { describe, expect, it } from "vitest";

import { renderManagerSummaryEmail } from "./manager-summary-email";

describe("manager summary email", () => {
  it("includes the AI summary and deep link but not full raw answers", () => {
    const rawOpenAnswer = "这是不应出现在邮件中的完整开放题正文";
    const html = renderManagerSummaryEmail({
      employeeName: "张三",
      cycleName: "FY27 Q1",
      weightedScore: 4.1,
      dimensionScores: { performance: 4.2, customer: 4, collaboration: 3.8, technical: 4.5 },
      overallSummary: "团队协同表现突出",
      strengths: ["重点机会推进稳定"],
      improvements: ["继续量化客户价值"],
      reviewUrl: "https://reviews.example.com/manager/reviews/r1",
    });

    expect(html).toContain("团队协同表现突出");
    expect(html).toContain("https://reviews.example.com/manager/reviews/r1");
    expect(html).not.toContain(rawOpenAnswer);
  });
});
