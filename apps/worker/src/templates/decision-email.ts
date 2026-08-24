import { assertHttpsUrl, escapeHtml } from "./html";

interface DecisionEmailInput {
  employeeName: string;
  cycleName: string;
  decision: "APPROVED" | "REJECTED";
  managerComment: string;
  reviewUrl: string;
}

export function renderDecisionEmail(input: DecisionEmailInput): string {
  const label = input.decision === "APPROVED" ? "已通过" : "已驳回，请修改后重新提交";
  return `<!doctype html><html lang="zh-CN"><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><main style="max-width:640px;margin:auto"><h1>${escapeHtml(input.cycleName)} 自评${label}</h1><p>${escapeHtml(input.employeeName)}，您好：</p><h2>经理评论</h2><p>${escapeHtml(input.managerComment)}</p><p><a href="${assertHttpsUrl(input.reviewUrl)}">登录 ReviewPilot 查看详情</a></p></main></body></html>`;
}
