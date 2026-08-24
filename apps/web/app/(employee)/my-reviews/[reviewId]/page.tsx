import { notFound, redirect } from "next/navigation";

import { auth } from "../../../../auth";
import { AiSummaryView } from "../../../../components/reviews/ai-summary-view";
import { ApprovalHistory } from "../../../../components/reviews/approval-history";
import { ReviewForm } from "../../../../components/reviews/review-form";
import { getMyReview, ReviewNotFoundError } from "../../../../lib/reviews/review-service";

export default async function ReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const session = await auth();
  if (!session?.user?.userId) redirect("/unauthorized");
  const { reviewId } = await params;
  let review;
  try {
    review = await getMyReview(session.user.userId, reviewId);
  } catch (error) {
    if (error instanceof ReviewNotFoundError) notFound();
    throw error;
  }
  const currentVersion = review.versions.find((version) => version.id === review.currentVersionId);
  if (!currentVersion) notFound();
  const editable = currentVersion.status === "DRAFT" || currentVersion.status === "REVISION_DRAFT";
  const summary = review.versions.find((version) => version.aiSummary)?.aiSummary;
  const approvals = review.versions.flatMap((version) => version.approval ? [{ version: version.version, ...version.approval }] : []);

  return (
    <main className="page-container review-page">
      <header className="page-header"><div><span className="eyebrow">{review.cycle.name}</span><h1>员工自评</h1><p>截止日期 {review.cycle.dueAt.toLocaleDateString("zh-CN")}</p></div><span className="status-badge">{currentVersion.status}</span></header>
      <ApprovalHistory approvals={approvals} />
      {summary && <section className="summary-panel employee-summary"><h2>AI 辅助总结</h2><AiSummaryView summary={summary} /></section>}
      <ReviewForm reviewId={review.id} initialLockVersion={currentVersion.lockVersion} editable={editable} template={review.template} initialAnswers={currentVersion.answers} />
    </main>
  );
}
