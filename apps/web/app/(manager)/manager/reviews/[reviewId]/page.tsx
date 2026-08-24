import { notFound, redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { ApprovalPanel } from "../../../../../components/approvals/approval-panel";
import { AiSummaryView } from "../../../../../components/reviews/ai-summary-view";
import { getManagerReview } from "../../../../../lib/manager/reviews";

export default async function ManagerReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const session = await auth();
  if (!session?.user.roles.some((role) => role === "MANAGER" || role === "ADMIN")) redirect("/unauthorized");
  const { reviewId } = await params;
  const review = await getManagerReview(reviewId, session.user.userId).catch(() => null);
  if (!review) notFound();
  const version = review.versions.find((item) => item.id === review.currentVersionId) ?? review.versions[0];
  if (!version) notFound();

  const labels = new Map(review.template.dimensions.flatMap((dimension) => [
    ...dimension.questions.map((question) => [question.id, question.label] as const),
    [dimension.bestThingQuestion.id, dimension.bestThingQuestion.label] as const,
    [dimension.improvementQuestion.id, dimension.improvementQuestion.label] as const,
  ]).concat(
    review.template.capabilities.map((item) => [item.id, item.label] as const),
    review.template.behaviors.map((item) => [item.id, item.label] as const),
    review.template.openQuestions.map((item) => [item.id, item.label] as const),
  ));

  return (
    <main className="page-container">
      <header className="page-header"><div><span className="eyebrow">{review.cycle.name}</span><h1>{review.employee.displayName} 的自评</h1><p>指定审批经理：{review.approverManager.displayName}</p></div><span className="status-badge">{version.status}</span></header>
      <div className="detail-grid">
        <section><h2>原始自评</h2>{Object.entries(version.answers).map(([id, answer]) => (
          <article className="answer-block" id={id} key={id}><h3>{labels.get(id) ?? id}</h3>{answer.numericValue && <strong>{answer.numericValue} / 5</strong>}{answer.booleanValue !== undefined && <p>{answer.booleanValue ? "已勾选" : "未勾选"}</p>}{answer.textValue && <p>{answer.textValue}</p>}</article>
        ))}</section>
        <aside><section className="summary-panel"><h2>确定性统计</h2>{version.scores ? <><strong className="score-number">{version.scores.weightedScore.toFixed(1)}</strong><p>加权总分</p><p>能力均分 {version.scores.capabilityAverage.toFixed(1)} · 行为 {version.scores.behaviorCount}/9</p></> : <p>尚未计算</p>}</section><section className="summary-panel"><h2>AI 辅助总结</h2>{version.aiSummary ? <AiSummaryView summary={version.aiSummary} /> : <p>总结生成中或尚不可用。</p>}</section>{version.status === "PENDING_REVIEW" && <ApprovalPanel versionId={version.id} lockVersion={version.lockVersion} canDecide={review.canDecide} />}</aside>
      </div>
    </main>
  );
}
