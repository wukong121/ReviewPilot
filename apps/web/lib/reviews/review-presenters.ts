import type { AiSummary } from "@employee-review/domain";

const DIMENSION_LABELS: Record<string, string> = {
  performance: "业绩与管线管理",
  customer: "客户关系与方案构建",
  collaboration: "跨团队协同",
  technical: "技术专精与学习",
};

const DECISION_LABELS: Record<string, string> = { APPROVED: "通过", REJECTED: "驳回" };

export function aiSummaryPresentation(summary: AiSummary) {
  return {
    overall: summary.overallSummary,
    strengths: summary.strengths.map(({ title, description }) => ({ title, text: description })),
    improvements: summary.improvements.map(({ title, action }) => ({ title, text: action })),
    dimensions: summary.dimensionSummaries.map(({ dimensionId, conclusion }) => ({ label: DIMENSION_LABELS[dimensionId] ?? dimensionId, conclusion })),
    discussionTopics: summary.managerDiscussionTopics,
    supportNeeds: summary.supportNeeds,
    caveats: summary.caveats,
  };
}

export function approvalDecisionLabel(decision: string): string {
  return DECISION_LABELS[decision] ?? decision;
}