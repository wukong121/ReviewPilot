import {
  ConcurrencyError,
  Prisma,
  ReviewRepository,
  prisma,
  type ReviewVersionStatus,
} from "@employee-review/db";
import {
  AiSummarySchema,
  TemplateDefinitionSchema,
  computeScores,
  type ComputedScores,
  type TemplateDefinition,
} from "@employee-review/domain";

export interface ReviewAnswerInput {
  numericValue?: number;
  booleanValue?: boolean;
  textValue?: string;
}

export interface ReviewDraft {
  reviewId: string;
  reviewVersionId: string;
  employeeId: string;
  lockVersion: number;
  status: ReviewVersionStatus;
  template: TemplateDefinition;
  answers: Record<string, ReviewAnswerInput>;
}

interface SaveDraftInput {
  actorId: string;
  reviewId: string;
  lockVersion: number;
  answers: Record<string, ReviewAnswerInput>;
}

interface SubmitReviewInput {
  actorId: string;
  reviewId: string;
  lockVersion: number;
}

interface AtomicSubmission {
  actorId: string;
  reviewVersionId: string;
  expectedLockVersion: number;
  scores: ComputedScores;
  snapshot: Prisma.InputJsonObject;
}

export interface ReviewStore {
  getOwnedDraft(actorId: string, reviewId: string): Promise<ReviewDraft | null>;
  saveAnswers(input: {
    actorId: string;
    reviewId: string;
    expectedLockVersion: number;
    answers: Record<string, ReviewAnswerInput>;
  }): Promise<number>;
  submitAtomic(input: AtomicSubmission): Promise<void>;
}

export class ReviewNotFoundError extends Error {
  readonly status = 404;
}

function requiredText(answers: Record<string, ReviewAnswerInput>, id: string, maxLength: number): string {
  const text = answers[id]?.textValue?.trim();
  if (!text) {
    throw new Error(`${id} is required`);
  }
  if (text.length > maxLength) {
    throw new Error(`${id} exceeds ${maxLength} characters`);
  }
  return text;
}

function requiredRating(answers: Record<string, ReviewAnswerInput>, id: string): number {
  const value = answers[id]?.numericValue;
  if (!Number.isInteger(value) || value === undefined || value < 1 || value > 5) {
    throw new Error(`${id} must be an integer between 1 and 5`);
  }
  return value;
}

function validateAndScore(
  template: TemplateDefinition,
  answers: Record<string, ReviewAnswerInput>,
): ComputedScores {
  const dimensions = template.dimensions.map((dimension) => {
    for (const question of dimension.questions) {
      requiredRating(answers, question.id);
      const evidence = answers[question.id]?.textValue;
      if (evidence && evidence.length > 10_000) {
        throw new Error(`${question.id} evidence exceeds 10000 characters`);
      }
    }
    requiredText(answers, dimension.bestThingQuestion.id, dimension.bestThingQuestion.maxLength);
    requiredText(answers, dimension.improvementQuestion.id, dimension.improvementQuestion.maxLength);
    return {
      id: dimension.id,
      weight: dimension.weight,
      scores: dimension.questions.map((question) => requiredRating(answers, question.id)),
    };
  });
  const capabilityScores = template.capabilities.map((capability) => requiredRating(answers, capability.id));
  for (const question of template.openQuestions) {
    requiredText(answers, question.id, question.maxLength);
  }

  return computeScores({
    dimensions,
    capabilityScores,
    behaviorChecks: template.behaviors.map((behavior) => answers[behavior.id]?.booleanValue === true),
  });
}

function validateDraftPatch(template: TemplateDefinition, answers: Record<string, ReviewAnswerInput>): void {
  const validIds = new Set([
    ...template.dimensions.flatMap((dimension) => [
      ...dimension.questions.map((question) => question.id),
      dimension.bestThingQuestion.id,
      dimension.improvementQuestion.id,
    ]),
    ...template.capabilities.map((field) => field.id),
    ...template.behaviors.map((field) => field.id),
    ...template.openQuestions.map((field) => field.id),
    ...template.preparationChecks.map((field) => field.id),
  ]);

  for (const [id, answer] of Object.entries(answers)) {
    if (!validIds.has(id)) {
      throw new Error(`unknown question: ${id}`);
    }
    if (answer.numericValue !== undefined && (!Number.isInteger(answer.numericValue) || answer.numericValue < 1 || answer.numericValue > 5)) {
      throw new Error(`${id} must be an integer between 1 and 5`);
    }
    if (answer.textValue && answer.textValue.length > 10_000) {
      throw new Error(`${id} exceeds 10000 characters`);
    }
  }
}

export class ReviewService {
  constructor(private readonly store: ReviewStore) {}

  async saveDraft(input: SaveDraftInput): Promise<{ lockVersion: number }> {
    const draft = await this.store.getOwnedDraft(input.actorId, input.reviewId);
    if (!draft) {
      throw new ReviewNotFoundError("review not found");
    }
    if (draft.status !== "DRAFT" && draft.status !== "REVISION_DRAFT") {
      throw new Error("review is not editable");
    }
    validateDraftPatch(draft.template, input.answers);
    const lockVersion = await this.store.saveAnswers({
      actorId: input.actorId,
      reviewId: input.reviewId,
      expectedLockVersion: input.lockVersion,
      answers: input.answers,
    });
    return { lockVersion };
  }

  async submitReview(input: SubmitReviewInput) {
    const draft = await this.store.getOwnedDraft(input.actorId, input.reviewId);
    if (!draft) {
      throw new ReviewNotFoundError("review not found");
    }
    const scores = validateAndScore(draft.template, draft.answers);
    const snapshot = {
      template: draft.template,
      answers: draft.answers,
      scores,
    } as unknown as Prisma.InputJsonObject;

    await this.store.submitAtomic({
      actorId: input.actorId,
      reviewVersionId: draft.reviewVersionId,
      expectedLockVersion: input.lockVersion,
      scores,
      snapshot,
    });
    return { status: "AI_PROCESSING" as const, scores };
  }
}

class PrismaReviewStore implements ReviewStore {
  async getOwnedDraft(actorId: string, reviewId: string): Promise<ReviewDraft | null> {
    const review = await prisma.review.findFirst({
      where: { id: reviewId, employeeId: actorId },
      include: { cycle: { include: { templateVersion: true } } },
    });
    if (!review?.currentVersionId) {
      return null;
    }
    const version = await prisma.reviewVersion.findFirst({
      where: { id: review.currentVersionId, reviewId: review.id },
      include: { answers: true },
    });
    if (!version) {
      return null;
    }

    return {
      reviewId: review.id,
      reviewVersionId: version.id,
      employeeId: review.employeeId,
      lockVersion: version.lockVersion,
      status: version.status,
      template: TemplateDefinitionSchema.parse(review.cycle.templateVersion.schemaJson),
      answers: Object.fromEntries(version.answers.map((answer) => [answer.questionId, {
        numericValue: answer.numericValue ?? undefined,
        booleanValue: answer.booleanValue ?? undefined,
        textValue: answer.textValue ?? undefined,
      }])),
    };
  }

  async saveAnswers(input: {
    actorId: string;
    reviewId: string;
    expectedLockVersion: number;
    answers: Record<string, ReviewAnswerInput>;
  }): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const review = await tx.review.findFirst({
        where: { id: input.reviewId, employeeId: input.actorId },
        select: { currentVersionId: true },
      });
      if (!review?.currentVersionId) {
        throw new ReviewNotFoundError("review not found");
      }
      const updated = await tx.reviewVersion.updateMany({
        where: {
          id: review.currentVersionId,
          lockVersion: input.expectedLockVersion,
          status: { in: ["DRAFT", "REVISION_DRAFT"] },
        },
        data: { lockVersion: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new ConcurrencyError();
      }

      await Promise.all(Object.entries(input.answers).map(([questionId, answer]) =>
        tx.reviewAnswer.upsert({
          where: { reviewVersionId_questionId: { reviewVersionId: review.currentVersionId!, questionId } },
          create: {
            reviewVersionId: review.currentVersionId!,
            questionId,
            numericValue: answer.numericValue ?? null,
            booleanValue: answer.booleanValue ?? null,
            textValue: answer.textValue ?? null,
          },
          update: {
            numericValue: answer.numericValue ?? null,
            booleanValue: answer.booleanValue ?? null,
            textValue: answer.textValue ?? null,
          },
        }),
      ));
      return input.expectedLockVersion + 1;
    });
  }

  async submitAtomic(input: AtomicSubmission): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const ownedVersion = await tx.reviewVersion.findFirst({
        where: { id: input.reviewVersionId, review: { employeeId: input.actorId } },
        select: { id: true },
      });
      if (!ownedVersion) {
        throw new ReviewNotFoundError("review not found");
      }

      await tx.computedScore.upsert({
        where: { reviewVersionId: input.reviewVersionId },
        create: {
          reviewVersionId: input.reviewVersionId,
          dimensionScoresJson: input.scores.dimensionScores,
          weightedScore: input.scores.weightedScore,
          capabilityAverage: input.scores.capabilityAverage,
          behaviorCount: input.scores.behaviorCount,
        },
        update: {
          dimensionScoresJson: input.scores.dimensionScores,
          weightedScore: input.scores.weightedScore,
          capabilityAverage: input.scores.capabilityAverage,
          behaviorCount: input.scores.behaviorCount,
        },
      });
      await new ReviewRepository().submitVersion(tx, {
        reviewVersionId: input.reviewVersionId,
        expectedLockVersion: input.expectedLockVersion,
        immutableSnapshot: input.snapshot,
      });
    });
  }
}

export const reviewService = new ReviewService(new PrismaReviewStore());

export async function listMyReviews(actorId: string) {
  const reviews = await prisma.review.findMany({
    where: { employeeId: actorId },
    orderBy: { cycle: { periodStart: "desc" } },
    include: {
      cycle: true,
      versions: {
        select: { id: true, version: true, status: true, submittedAt: true, updatedAt: true, approval: { select: { decision: true, comment: true, decidedAt: true } } },
        orderBy: { version: "desc" },
      },
    },
  });

  return reviews.map((review) => ({
    id: review.id,
    cycle: {
      id: review.cycle.id,
      name: review.cycle.name,
      periodStart: review.cycle.periodStart,
      periodEnd: review.cycle.periodEnd,
      dueAt: review.cycle.dueAt,
      status: review.cycle.status,
    },
    currentVersion: review.versions.find((version) => version.id === review.currentVersionId) ?? null,
    latestApproval: review.versions.find((version) => version.approval)?.approval ?? null,
    versionCount: review.versions.length,
  }));
}

export async function getMyReview(actorId: string, reviewId: string) {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, employeeId: actorId },
    include: {
      cycle: { include: { templateVersion: true } },
      versions: {
        orderBy: { version: "desc" },
        include: { answers: true, computedScore: true, aiSummary: true, approval: true },
      },
    },
  });
  if (!review) {
    throw new ReviewNotFoundError("review not found");
  }

  const template = TemplateDefinitionSchema.parse(review.cycle.templateVersion.schemaJson);
  return {
    id: review.id,
    employeeId: review.employeeId,
    approverManagerId: review.approverManagerId,
    currentVersionId: review.currentVersionId,
    cycle: {
      id: review.cycle.id,
      name: review.cycle.name,
      periodStart: review.cycle.periodStart,
      periodEnd: review.cycle.periodEnd,
      dueAt: review.cycle.dueAt,
      status: review.cycle.status,
    },
    template,
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
      aiSummary: version.aiSummary ? AiSummarySchema.safeParse(version.aiSummary.summaryJson).data ?? null : null,
      approval: version.approval ? {
        decision: version.approval.decision,
        comment: version.approval.comment,
        decidedAt: version.approval.decidedAt,
      } : null,
    })),
  };
}
