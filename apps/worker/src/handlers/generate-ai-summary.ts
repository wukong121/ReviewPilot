import { Prisma, prisma, type ReviewVersionStatus } from "@employee-review/db";
import { AiSummarySchema, type AiSummary } from "@employee-review/domain";
import { z } from "zod";

import { AiProviderError, type AiSummaryProvider } from "../adapters/apim-ai-provider";
import { PermanentJobError, RetryableJobError, type JobHandler, type WorkerJob } from "../job-runner";

const PayloadSchema = z.object({ reviewVersionId: z.string().min(1) });

interface FrozenVersion {
  status: ReviewVersionStatus;
  snapshot: unknown;
  alreadySummarized: boolean;
}

interface SaveSummaryInput {
  reviewVersionId: string;
  summary: AiSummary;
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
}

export interface AiSummaryStore {
  loadFrozenVersion(reviewVersionId: string): Promise<FrozenVersion | null>;
  saveSummaryAtomic(input: SaveSummaryInput): Promise<void>;
}

interface HandlerMetadata {
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
}

function questionIds(snapshot: unknown): Set<string> {
  if (!snapshot || typeof snapshot !== "object" || !("answers" in snapshot)) return new Set();
  const answers = snapshot.answers;
  return answers && typeof answers === "object" && !Array.isArray(answers)
    ? new Set(Object.keys(answers))
    : new Set();
}

function validateEvidence(summary: AiSummary, validIds: Set<string>): void {
  const referencedIds = [
    ...summary.dimensionSummaries.flatMap((item) => item.evidenceQuestionIds),
    ...summary.strengths.flatMap((item) => item.evidenceQuestionIds),
    ...summary.improvements.flatMap((item) => item.evidenceQuestionIds),
  ];
  if (referencedIds.some((id) => !validIds.has(id))) {
    throw new RetryableJobError("AI_INVALID_RESPONSE");
  }
}

export class GenerateAiSummaryHandler implements JobHandler {
  constructor(
    private readonly provider: AiSummaryProvider,
    private readonly store: AiSummaryStore,
    private readonly metadata: HandlerMetadata,
  ) {}

  async run(job: WorkerJob): Promise<void> {
    const payload = PayloadSchema.safeParse(job.payloadJson);
    if (!payload.success) throw new PermanentJobError("INVALID_JOB_PAYLOAD");
    const frozen = await this.store.loadFrozenVersion(payload.data.reviewVersionId);
    if (!frozen) throw new PermanentJobError("REVIEW_VERSION_NOT_FOUND");
    if (frozen.alreadySummarized) return;
    if (frozen.status !== "AI_PROCESSING") throw new PermanentJobError("INVALID_REVIEW_STATUS");

    let summary: AiSummary;
    try {
      summary = AiSummarySchema.parse(await this.provider.generate({ snapshot: frozen.snapshot }));
    } catch (error) {
      if (error instanceof RetryableJobError || error instanceof PermanentJobError) throw error;
      if (error instanceof AiProviderError) {
        throw error.retryable ? new RetryableJobError(error.code) : new PermanentJobError(error.code);
      }
      throw new RetryableJobError("AI_INVALID_RESPONSE");
    }
    validateEvidence(summary, questionIds(frozen.snapshot));
    await this.store.saveSummaryAtomic({
      reviewVersionId: payload.data.reviewVersionId,
      summary,
      ...this.metadata,
    });
  }
}

export class PrismaAiSummaryStore implements AiSummaryStore {
  async loadFrozenVersion(reviewVersionId: string): Promise<FrozenVersion | null> {
    const version = await prisma.reviewVersion.findUnique({
      where: { id: reviewVersionId },
      select: { status: true, immutableSnapshotJson: true, aiSummary: { select: { id: true } } },
    });
    if (!version?.immutableSnapshotJson) return null;
    return {
      status: version.status,
      snapshot: version.immutableSnapshotJson,
      alreadySummarized: version.aiSummary !== null,
    };
  }

  async saveSummaryAtomic(input: SaveSummaryInput): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.aiSummary.upsert({
        where: { reviewVersionId: input.reviewVersionId },
        create: {
          reviewVersionId: input.reviewVersionId,
          schemaVersion: input.schemaVersion,
          promptVersion: input.promptVersion,
          modelId: input.modelId,
          summaryJson: input.summary as unknown as Prisma.InputJsonObject,
        },
        update: {},
      });
      const transitioned = await tx.reviewVersion.updateMany({
        where: { id: input.reviewVersionId, status: "AI_PROCESSING" },
        data: { status: "PENDING_REVIEW", lockVersion: { increment: 1 } },
      });
      await tx.backgroundJob.upsert({
        where: { idempotencyKey: `manager-summary:${input.reviewVersionId}` },
        create: {
          type: "SEND_MANAGER_SUMMARY",
          idempotencyKey: `manager-summary:${input.reviewVersionId}`,
          payloadJson: { reviewVersionId: input.reviewVersionId },
        },
        update: {},
      });
      if (transitioned.count === 1) {
        await tx.auditEvent.create({
          data: {
            action: "AI_SUMMARY_CREATED",
            entityType: "ReviewVersion",
            entityId: input.reviewVersionId,
            metadataJson: { modelId: input.modelId, promptVersion: input.promptVersion },
          },
        });
      }
    });
  }
}
