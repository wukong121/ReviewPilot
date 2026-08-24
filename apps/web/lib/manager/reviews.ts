import { TemplateDefinitionSchema } from "@employee-review/domain";
import { prisma } from "@employee-review/db";

export interface ManagerReviewFilters {
  cycleId?: string;
  status?: string;
  employeeId?: string;
  approverManagerId?: string;
}

export async function listManagerReviews(filters: ManagerReviewFilters = {}) {
  const reviews = await prisma.review.findMany({
    where: {
      cycleId: filters.cycleId,
      employeeId: filters.employeeId,
      approverManagerId: filters.approverManagerId,
    },
    include: {
      employee: { select: { id: true, displayName: true, email: true } },
      approverManager: { select: { id: true, displayName: true } },
      cycle: { select: { id: true, name: true, dueAt: true } },
      versions: { orderBy: { version: "desc" }, select: { id: true, version: true, status: true, updatedAt: true } },
    },
    orderBy: [{ cycle: { periodStart: "desc" } }, { employee: { displayName: "asc" } }],
  });

  return reviews.map((review) => ({
    id: review.id,
    employee: review.employee,
    approverManager: review.approverManager,
    cycle: review.cycle,
    currentVersion: review.versions.find((version) => version.id === review.currentVersionId) ?? null,
    versionCount: review.versions.length,
  })).filter((review) => !filters.status || review.currentVersion?.status === filters.status);
}

export async function getManagerReview(reviewId: string, actorId: string) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: {
      employee: { select: { id: true, displayName: true, email: true } },
      approverManager: { select: { id: true, displayName: true, email: true } },
      cycle: { include: { templateVersion: true } },
      versions: {
        orderBy: { version: "desc" },
        include: { answers: true, computedScore: true, aiSummary: true, approval: true },
      },
    },
  });
  if (!review) {
    const error = new Error("review not found") as Error & { status: number };
    error.status = 404;
    throw error;
  }
  return {
    id: review.id,
    employee: review.employee,
    approverManager: review.approverManager,
    cycle: { id: review.cycle.id, name: review.cycle.name, dueAt: review.cycle.dueAt },
    template: TemplateDefinitionSchema.parse(review.cycle.templateVersion.schemaJson),
    currentVersionId: review.currentVersionId,
    canDecide: review.approverManagerId === actorId,
    versions: review.versions.map((version) => ({
      id: version.id,
      version: version.version,
      status: version.status,
      lockVersion: version.lockVersion,
      submittedAt: version.submittedAt,
      answers: Object.fromEntries(version.answers.map((answer) => [answer.questionId, {
        numericValue: answer.numericValue ?? undefined,
        booleanValue: answer.booleanValue ?? undefined,
        textValue: answer.textValue ?? undefined,
      }])),
      scores: version.computedScore ? {
        dimensionScores: version.computedScore.dimensionScoresJson,
        weightedScore: Number(version.computedScore.weightedScore),
        capabilityAverage: Number(version.computedScore.capabilityAverage),
        behaviorCount: version.computedScore.behaviorCount,
      } : null,
      aiSummary: version.aiSummary?.summaryJson ?? null,
      approval: version.approval ? {
        decision: version.approval.decision,
        comment: version.approval.comment,
        decidedAt: version.approval.decidedAt,
      } : null,
    })),
  };
}
