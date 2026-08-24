import type { Prisma } from "@prisma/client";

interface SubmissionTransaction {
  reviewVersion: {
    updateMany(args: {
      where: {
        id: string;
        lockVersion: number;
        status: { in: ["DRAFT", "REVISION_DRAFT"] };
      };
      data: {
        status: "AI_PROCESSING";
        immutableSnapshotJson: Prisma.InputJsonValue;
        submittedAt: Date;
        lockVersion: { increment: 1 };
      };
    }): Promise<{ count: number }>;
  };
  backgroundJob: {
    create(args: {
      data: {
        type: "GENERATE_AI_SUMMARY";
        idempotencyKey: string;
        payloadJson: { reviewVersionId: string };
      };
    }): Promise<unknown>;
  };
}

export interface SubmitVersionInput {
  reviewVersionId: string;
  expectedLockVersion: number;
  immutableSnapshot: Prisma.InputJsonValue;
  submittedAt?: Date;
}

export class ConcurrencyError extends Error {
  constructor() {
    super("review version changed or is no longer editable");
    this.name = "ConcurrencyError";
  }
}

export class ReviewRepository {
  async submitVersion(tx: SubmissionTransaction, input: SubmitVersionInput): Promise<void> {
    const submittedAt = input.submittedAt ?? new Date();
    const result = await tx.reviewVersion.updateMany({
      where: {
        id: input.reviewVersionId,
        lockVersion: input.expectedLockVersion,
        status: { in: ["DRAFT", "REVISION_DRAFT"] },
      },
      data: {
        status: "AI_PROCESSING",
        immutableSnapshotJson: input.immutableSnapshot,
        submittedAt,
        lockVersion: { increment: 1 },
      },
    });

    if (result.count !== 1) {
      throw new ConcurrencyError();
    }

    await tx.backgroundJob.create({
      data: {
        type: "GENERATE_AI_SUMMARY",
        idempotencyKey: `ai:${input.reviewVersionId}`,
        payloadJson: { reviewVersionId: input.reviewVersionId },
      },
    });
  }
}
