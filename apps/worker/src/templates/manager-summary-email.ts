import { assertHttpsUrl, escapeHtml } from "./html";

interface ManagerSummaryEmailInput {
  employeeName: string;
  cycleName: string;
  weightedScore: number;
  dimensionScores: Record<string, number>;
  overallSummary: string;
  strengths: string[];
  improvements: string[];
  reviewUrl: string;
}

export function renderManagerSummaryEmail(input: ManagerSummaryEmailInput): string {
  const dimensions = Object.entries(input.dimensionScores)
    .map(([name, score]) => `<li>${escapeHtml(name)}：${score.toFixed(1)}</li>`)
    .join("");
  const list = (items: string[]) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `<!doctype html>
<html lang="zh-CN"><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.6">
<main style="max-width:640px;margin:auto">
<h1 style="font-size:24px">${escapeHtml(input.employeeName)} 的自评待审批</h1>
<p>评审周期：${escapeHtml(input.cycleName)}</p>
<h2 style="font-size:18px">确定性统计</h2>
<p><strong>加权总分：${input.weightedScore.toFixed(1)}</strong></p><ul>${dimensions}</ul>
<h2 style="font-size:18px">AI 辅助总结</h2><p>${escapeHtml(input.overallSummary)}</p>
<h3 style="font-size:16px">优势</h3><ul>${list(input.strengths)}</ul>
<h3 style="font-size:16px">改进建议</h3><ul>${list(input.improvements)}</ul>
<p><a href="${assertHttpsUrl(input.reviewUrl)}">登录 ReviewPilot 查看原始自评并审批</a></p>
<p style="color:#596579">AI 总结仅供辅助，最终判断由经理完成。</p>
</main></body></html>`;
}

export function renderManagerSummaryText(input: ManagerSummaryEmailInput): string {
  return `${input.employeeName} 的自评待审批\n评审周期：${input.cycleName}\n加权总分：${input.weightedScore.toFixed(1)}\n\n${input.overallSummary}\n\n登录查看：${input.reviewUrl}`;
}
