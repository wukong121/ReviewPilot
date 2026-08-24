import { NotificationStatus, NotificationType, prisma } from "@employee-review/db";
import { AiSummarySchema } from "@employee-review/domain";
import { z } from "zod";

import { MailProviderError, type MailMessage, type MailProvider } from "../adapters/mail-provider";
import { PermanentJobError, RetryableJobError, type JobHandler, type WorkerJob } from "../job-runner";
import { renderDecisionEmail } from "../templates/decision-email";
import { renderManagerSummaryEmail, renderManagerSummaryText } from "../templates/manager-summary-email";

const PayloadSchema = z.object({ reviewVersionId: z.string().min(1) }).passthrough();

interface PreparedNotification {
  recipient: string;
  type: NotificationType;
  message: MailMessage;
}

export interface NotificationStore {
  prepare(job: WorkerJob, publicBaseUrl: string): Promise<PreparedNotification | null>;
  begin(job: WorkerJob, notification: PreparedNotification): Promise<NotificationStatus>;
  markSent(jobId: string): Promise<void>;
}

export class SendNotificationHandler implements JobHandler {
  constructor(
    private readonly mailProvider: MailProvider,
    private readonly store: NotificationStore,
    private readonly publicBaseUrl: string,
  ) {}

  async run(job: WorkerJob): Promise<void> {
    const notification = await this.store.prepare(job, this.publicBaseUrl);
    if (!notification) throw new PermanentJobError("NOTIFICATION_DATA_NOT_FOUND");
    const status = await this.store.begin(job, notification);
    if (status === NotificationStatus.SENT) return;

    try {
      await this.mailProvider.send(notification.message);
    } catch (error) {
      if (error instanceof MailProviderError) {
        throw error.retryable ? new RetryableJobError(error.code) : new PermanentJobError(error.code);
      }
      throw new RetryableJobError("MAIL_UPSTREAM");
    }
    await this.store.markSent(job.id);
  }
}

export class PrismaNotificationStore implements NotificationStore {
  async prepare(job: WorkerJob, publicBaseUrl: string): Promise<PreparedNotification | null> {
    const payload = PayloadSchema.safeParse(job.payloadJson);
    if (!payload.success) throw new PermanentJobError("INVALID_JOB_PAYLOAD");
    const version = await prisma.reviewVersion.findUnique({
      where: { id: payload.data.reviewVersionId },
      include: {
        review: { include: { employee: true, approverManager: true, cycle: true } },
        computedScore: true,
        aiSummary: true,
        approval: true,
      },
    });
    if (!version) return null;
    const baseUrl = new URL(publicBaseUrl);

    if (job.type === "SEND_MANAGER_SUMMARY" && version.computedScore && version.aiSummary) {
      const summary = AiSummarySchema.parse(version.aiSummary.summaryJson);
      const reviewUrl = new URL(`/manager/reviews/${version.reviewId}`, baseUrl).toString();
      const input = {
        employeeName: version.review.employee.displayName,
        cycleName: version.review.cycle.name,
        weightedScore: Number(version.computedScore.weightedScore),
        dimensionScores: version.computedScore.dimensionScoresJson as Record<string, number>,
        overallSummary: summary.overallSummary,
        strengths: summary.strengths.map((item) => `${item.title}：${item.description}`),
        improvements: summary.improvements.map((item) => `${item.title}：${item.action}`),
        reviewUrl,
      };
      return {
        recipient: version.review.approverManager.email,
        type: NotificationType.MANAGER_SUMMARY,
        message: {
          to: version.review.approverManager.email,
          subject: `${version.review.employee.displayName} 的 ${version.review.cycle.name} 自评待审批`,
          html: renderManagerSummaryEmail(input),
          text: renderManagerSummaryText(input),
        },
      };
    }

    if ((job.type === "SEND_APPROVED" || job.type === "SEND_REJECTED") && version.approval) {
      const decision = job.type === "SEND_APPROVED" ? "APPROVED" : "REJECTED";
      if (version.approval.decision !== decision) {
        throw new PermanentJobError("NOTIFICATION_DECISION_MISMATCH");
      }
      const reviewUrl = new URL(`/my-reviews/${version.reviewId}`, baseUrl).toString();
      return {
        recipient: version.review.employee.email,
        type: decision === "APPROVED" ? NotificationType.REVIEW_APPROVED : NotificationType.REVIEW_REJECTED,
        message: {
          to: version.review.employee.email,
          subject: `${version.review.cycle.name} 自评${decision === "APPROVED" ? "已通过" : "已驳回"}`,
          html: renderDecisionEmail({
            employeeName: version.review.employee.displayName,
            cycleName: version.review.cycle.name,
            decision,
            managerComment: version.approval.comment,
            reviewUrl,
          }),
        },
      };
    }
    return null;
  }

  async begin(job: WorkerJob, notification: PreparedNotification): Promise<NotificationStatus> {
    const record = await prisma.notification.upsert({
      where: { idempotencyKey: `mail:${job.id}` },
      create: {
        jobId: job.id,
        idempotencyKey: `mail:${job.id}`,
        recipient: notification.recipient,
        type: notification.type,
      },
      update: {},
      select: { status: true },
    });
    return record.status;
  }

  async markSent(jobId: string): Promise<void> {
    await prisma.notification.update({
      where: { idempotencyKey: `mail:${jobId}` },
      data: { status: NotificationStatus.SENT, sentAt: new Date() },
    });
  }
}
