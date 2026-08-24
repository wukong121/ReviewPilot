import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "../../../auth";
import { listMyReviews } from "../../../lib/reviews/review-service";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "填写中",
  REVISION_DRAFT: "待修改",
  AI_PROCESSING: "AI 总结处理中",
  PENDING_REVIEW: "待经理审批",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};

export default async function MyReviewsPage() {
  const session = await auth();
  if (!session?.user?.userId) redirect("/unauthorized");
  const reviews = await listMyReviews(session.user.userId);

  return (
    <main className="page-container">
      <header className="page-header"><div><span className="eyebrow">个人工作台</span><h1>我的自评</h1></div></header>
      {reviews.length === 0 ? <p className="empty-state">当前没有需要填写的评审周期。</p> : (
        <div className="review-list">
          {reviews.map((review) => (
            <article className="review-card" key={review.id}>
              <div><span className="status-badge">{STATUS_LABELS[review.currentVersion?.status ?? ""] ?? "未开始"}</span><h2>{review.cycle.name}</h2><p>{review.cycle.periodStart.toLocaleDateString("zh-CN")} - {review.cycle.periodEnd.toLocaleDateString("zh-CN")}</p></div>
              <Link className="primary-link" href={`/my-reviews/${review.id}`}>查看自评</Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
