export interface WorkerJob {
  id: string;
  type: string;
  attempts: number;
  payloadJson: unknown;
}

export interface WorkerJobRepository {
  claimNext(): Promise<WorkerJob | null>;
  complete(id: string): Promise<void>;
  retry(id: string, errorCode: string, runAfter: Date): Promise<void>;
  markDead(id: string, errorCode: string): Promise<void>;
}

export interface JobHandler {
  run(job: WorkerJob): Promise<void>;
}

export class RetryableJobError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RetryableJobError";
  }
}

export class PermanentJobError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PermanentJobError";
  }
}

const RETRY_DELAYS_MINUTES = [1, 5, 15, 60] as const;

export class JobRunner {
  constructor(
    private readonly repository: WorkerJobRepository,
    private readonly handlers: Record<string, JobHandler>,
  ) {}

  async runOnce(): Promise<boolean> {
    const job = await this.repository.claimNext();
    if (!job) return false;

    const handler = this.handlers[job.type];
    if (!handler) {
      await this.repository.markDead(job.id, "UNKNOWN_JOB_TYPE");
      return true;
    }

    try {
      await handler.run(job);
      await this.repository.complete(job.id);
    } catch (error) {
      if (error instanceof RetryableJobError && job.attempts < 5) {
        const delayMinutes = RETRY_DELAYS_MINUTES[job.attempts - 1];
        const runAfter = new Date(Date.now() + delayMinutes * 60_000);
        await this.repository.retry(job.id, error.code, runAfter);
      } else {
        const errorCode = error instanceof RetryableJobError || error instanceof PermanentJobError
          ? error.code
          : "UNEXPECTED_JOB_ERROR";
        await this.repository.markDead(job.id, errorCode);
      }
    }
    return true;
  }
}
