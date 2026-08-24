"use client";

import { useState } from "react";

interface ApprovalPanelProps {
  versionId: string;
  lockVersion: number;
  canDecide: boolean;
}

export function ApprovalPanel({ versionId, lockVersion, canDecide }: ApprovalPanelProps) {
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    if (!comment.trim()) {
      setError("请填写经理评论。");
      return;
    }
    setPending(decision);
    setError(null);
    const response = await fetch(`/api/manager/review-versions/${versionId}/${decision}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment, lockVersion }),
    });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      setError(response.status === 409 ? "此版本已被处理，请刷新页面。" : result.error ?? "审批失败");
      setPending(null);
      return;
    }
    window.location.reload();
  }

  if (!canDecide) {
    return <p className="notice">仅指定审批经理可以做出决定，当前为只读模式。</p>;
  }
  return (
    <section className="approval-panel" aria-labelledby="approval-heading">
      <h2 id="approval-heading">经理审批</h2>
      <label htmlFor="manager-comment">经理评论</label>
      <textarea id="manager-comment" required maxLength={10_000} value={comment} onChange={(event) => setComment(event.target.value)} />
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="button-row">
        <button type="button" className="secondary-button danger" disabled={pending !== null} onClick={() => void decide("reject")}>{pending === "reject" ? "处理中..." : "驳回"}</button>
        <button type="button" className="primary-button" disabled={pending !== null} onClick={() => void decide("approve")}>{pending === "approve" ? "处理中..." : "通过"}</button>
      </div>
    </section>
  );
}
