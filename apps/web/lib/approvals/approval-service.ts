import { ConcurrencyError, Prisma, prisma, type ReviewVersionStatus } from "@employee-review/db";
import { assertTransition } from "@employee-review/domain";

interface CopiedAnswer {
  questionId: string;
  numericValue?: number;
  booleanValue?: boolean;
  textValue?: string;
}

interface DecisionContext {
  reviewId: string;
  reviewVersionId: string;
  version: number;
  status: ReviewVersionStatus;
  lockVersion: number;
  employeeId: string;
  approverManagerId: string;
  answers: CopiedAnswer[];
}

interface DecisionInput {
  actorId: string;
  versionId: string;
  comment: string;
  lockVersion: number;
}

interface AtomicDecisionInput extends DecisionInput {
  expectedLockVersion: number;
  context: DecisionContext;
}

interface RevisionResult {
  rejectedVersion: { id: string; status: "REJECTED" };
  newVersion: {
    id: string;
    version: number;
    status: "REVISION_DRAFT";
    answers: CopiedAnswer[];
  };
}

export interface ApprovalStore {
  getDecisionContext(versionId: string): Promise<DecisionContext | null>;
  approveAtomic(input: AtomicDecisionInput): Promise<{ status: "APPROVED" }>;
  rejectAtomic(input: AtomicDecisionInput): Promise<RevisionResult>;
}

export class ApprovalService {
  constructor(private readonly store: ApprovalStore) {}

  private async validate(input: DecisionInput): Promise<{ input: AtomicDecisionInput }> {
    const comment = input.comment.trim();
    if (!comment) {
      throw new Error("comment is required");
    }
    const context = await this.store.getDecisionContext(input.versionId);
    if (!context) {
      throw new Error("review version not found");
    }
    if (context.approverManagerId !== input.actorId) {
      throw new Error("only the assigned manager can decide");
    }
    if (context.lockVersion !== input.lockVersion) {
      throw new ConcurrencyError();
    }
    return {
      input: {
        ...input,
        comment,
        expectedLockVersion: input.lockVersion,
        context,
      },
    };
  }

  async approve(input: DecisionInput): Promise<{ status: "APPROVED" }> {
    const validated = await this.validate(input);
    assertTransition(validated.input.context.status, "APPROVED");
    return this.store.approveAtomic(validated.input);
  }

  async reject(input: DecisionInput): Promise<RevisionResult> {
    const validated = await this.validate(input);
    assertTransition(validated.input.context.status, "REJECTED");
    return this.store.rejectAtomic(validated.input);
  }
}

class PrismaApprovalStore implements ApprovalStore {
  async getDecisionContext(versionId: string): Promise<DecisionContext | null> {
    const version = await prisma.reviewVersion.findUnique({
      where: { id: versionId },
      include: { review: true, answers: true },
    });
    if (!version) return null;
    return {
      reviewId: version.reviewId,
      reviewVersionId: version.id,
      version: version.version,
      status: version.status,
      lockVersion: version.lockVersion,
      employeeId: version.review.employeeId,
      approverManagerId: version.review.approverManagerId,
      answers: version.answers.map((answer) => ({
        questionId: answer.questionId,
        numericValue: answer.numericValue ?? undefined,
        booleanValue: answer.booleanValue ?? undefined,
        textValue: answer.textValue ?? undefined,
      })),
    };
  }

  async approveAtomic(input: AtomicDecisionInput): Promise<{ status: "APPROVED" }> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.reviewVersion.updateMany({
        where: {
          id: input.versionId,
          status: "PENDING_REVIEW",
          lockVersion: input.expectedLockVersion,
          review: { approverManagerId: input.actorId },
        },
        data: { status: "APPROVED", lockVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConcurrencyError();

      await tx.approval.create({
        data: {
          reviewVersionId: input.versionId,
          managerId: input.actorId,
          decision: "APPROVED",
          comment: input.comment,
        },
      });
      await tx.backgroundJob.create({
        data: {
          type: "SEND_APPROVED",
          idempotencyKey: `decision:approved:${input.versionId}`,
          payloadJson: { reviewVersionId: input.versionId },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: input.actorId,
          action: "REVIEW_APPROVED",
          entityType: "ReviewVersion",
          entityId: input.versionId,
          metadataJson: { reviewId: input.context.reviewId },
        },
      });
      return { status: "APPROVED" };
    });
  }

  async rejectAtomic(input: AtomicDecisionInput): Promise<RevisionResult> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.reviewVersion.updateMany({
        where: {
          id: input.versionId,
          status: "PENDING_REVIEW",
          lockVersion: input.expectedLockVersion,
          review: { approverManagerId: input.actorId },
        },
        data: { status: "REJECTED", lockVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConcurrencyError();

      const revision = await tx.reviewVersion.create({
        data: {
          reviewId: input.context.reviewId,
          version: input.context.version + 1,
          status: "REVISION_DRAFT",
          answers: {
            create: input.context.answers.map((answer) => ({
              questionId: answer.questionId,
              numericValue: answer.numericValue ?? null,
              booleanValue: answer.booleanValue ?? null,
              textValue: answer.textValue ?? null,
            })),
          },
        },
      });
      await tx.review.update({
        where: { id: input.context.reviewId },
        data: { currentVersionId: revision.id },
      });
      await tx.approval.create({
        data: {
          reviewVersionId: input.versionId,
          managerId: input.actorId,
          decision: "REJECTED",
          comment: input.comment,
        },
      });
      await tx.backgroundJob.create({
        data: {
          type: "SEND_REJECTED",
          idempotencyKey: `decision:rejected:${input.versionId}`,
          payloadJson: { reviewVersionId: input.versionId, revisionVersionId: revision.id },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: input.actorId,
          action: "REVIEW_REJECTED",
          entityType: "ReviewVersion",
          entityId: input.versionId,
          metadataJson: { reviewId: input.context.reviewId, revisionVersionId: revision.id },
        },
      });

      return {
        rejectedVersion: { id: input.versionId, status: "REJECTED" },
        newVersion: {
          id: revision.id,
          version: revision.version,
          status: "REVISION_DRAFT",
          answers: input.context.answers,
        },
      };
    });
  }
}

export const approvalService = new ApprovalService(new PrismaApprovalStore());
