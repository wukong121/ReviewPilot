interface ApprovalItem {
  version: number;
  decision: string;
  comment: string;
  decidedAt: Date;
}

import { approvalDecisionLabel } from "../../lib/reviews/review-presenters";

export function ApprovalHistory({ approvals }: { approvals: ApprovalItem[] }) {
  if (approvals.length === 0) return null;
  return (
    <section className="approval-history" aria-labelledby="approval-history-title">
      <h2 id="approval-history-title">经理意见</h2>
      {approvals.map((approval) => (
        <article key={`${approval.version}-${approval.decidedAt.toISOString()}`}>
          <div><span className="status-badge">{approvalDecisionLabel(approval.decision)}</span><strong>第 {approval.version} 版</strong><time>{approval.decidedAt.toLocaleString("zh-CN")}</time></div>
          <p>{approval.comment}</p>
        </article>
      ))}
    </section>
  );
}