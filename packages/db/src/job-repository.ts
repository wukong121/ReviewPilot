import { JobStatus, Prisma, type BackgroundJob, type PrismaClient } from "@prisma/client";

const CLAIMABLE_STATUSES: JobStatus[] = [JobStatus.QUEUED, JobStatus.RETRY_WAIT];

export class JobRepository {
  constructor(private readonly client: PrismaClient) {}

  async claimNext(now = new Date()): Promise<BackgroundJob | null> {
    return this.client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM "BackgroundJob"
        WHERE status::text IN (${Prisma.join(CLAIMABLE_STATUSES)})
          AND "runAfter" <= ${now}
        ORDER BY "runAfter", "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);

      const row = rows[0];
      if (!row) {
        return null;
      }

      return tx.backgroundJob.update({
        where: { id: row.id },
        data: {
          status: JobStatus.PROCESSING,
          attempts: { increment: 1 },
          lockedAt: now,
        },
      });
    });
  }

  async complete(id: string): Promise<void> {
    await this.client.backgroundJob.update({
      where: { id },
      data: { status: JobStatus.SUCCEEDED, lockedAt: null, lastErrorCode: null },
    });
  }

  async retry(id: string, errorCode: string, runAfter: Date): Promise<void> {
    await this.client.backgroundJob.update({
      where: { id },
      data: { status: JobStatus.RETRY_WAIT, runAfter, lockedAt: null, lastErrorCode: errorCode },
    });
  }

  async markDead(id: string, errorCode: string): Promise<void> {
    await this.client.backgroundJob.update({
      where: { id },
      data: { status: JobStatus.DEAD, lockedAt: null, lastErrorCode: errorCode },
    });
  }

  async requeue(id: string): Promise<void> {
    await this.client.backgroundJob.update({
      where: { id, status: JobStatus.DEAD },
      data: {
        status: JobStatus.QUEUED,
        attempts: 0,
        runAfter: new Date(),
        lockedAt: null,
      },
    });
  }
}
