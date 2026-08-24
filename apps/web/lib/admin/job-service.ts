import { JobStatus, prisma } from "@employee-review/db";

import { can, type Actor } from "../auth/permissions";

interface JobRecord { id: string; status: string; lastErrorCode: string | null }

export interface AdminJobRepository {
  findById(id: string): Promise<JobRecord | null>;
  requeue(id: string, actorId: string): Promise<void>;
}

export class JobService {
  constructor(private readonly repository: AdminJobRepository) {}

  async retry(id: string, actor: Actor): Promise<void> {
    if (!can(actor, "admin:retry-jobs")) throw new Error("forbidden");
    const job = await this.repository.findById(id);
    if (!job) throw Object.assign(new Error("job not found"), { status: 404 });
    if (job.status !== JobStatus.DEAD) throw Object.assign(new Error("job is not DEAD"), { status: 409 });
    await this.repository.requeue(id, actor.id);
  }
}

class PrismaAdminJobRepository implements AdminJobRepository {
  findById(id: string): Promise<JobRecord | null> {
    return prisma.backgroundJob.findUnique({ where: { id }, select: { id: true, status: true, lastErrorCode: true } });
  }

  async requeue(id: string, actorId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const job = await tx.backgroundJob.update({
        where: { id, status: JobStatus.DEAD },
        data: { status: JobStatus.QUEUED, attempts: 0, runAfter: new Date(), lockedAt: null },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: "BACKGROUND_JOB_RETRIED",
          entityType: "BackgroundJob",
          entityId: id,
          metadataJson: { previousErrorCode: job.lastErrorCode },
        },
      });
    });
  }
}

export const jobService = new JobService(new PrismaAdminJobRepository());

export async function listJobs() {
  return prisma.backgroundJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, type: true, status: true, attempts: true, runAfter: true, lockedAt: true, lastErrorCode: true, createdAt: true, updatedAt: true },
  });
}

export async function listAuditEvents(filters: { actorId?: string; action?: string; entityType?: string; cursor?: string }) {
  const events = await prisma.auditEvent.findMany({
    where: { actorId: filters.actorId, action: filters.action, entityType: filters.entityType },
    orderBy: { createdAt: "desc" },
    take: 51,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    include: { actor: { select: { displayName: true, email: true } } },
  });
  return { items: events.slice(0, 50), nextCursor: events.length > 50 ? events[49].id : null };
}
