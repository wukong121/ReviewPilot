import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobRunner, RetryableJobError, type WorkerJobRepository } from "./job-runner";

describe("JobRunner", () => {
  const repository: WorkerJobRepository = {
    claimNext: vi.fn(),
    complete: vi.fn(),
    retry: vi.fn(),
    markDead: vi.fn(),
  };
  const handler = { run: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the fifth retryable failure DEAD", async () => {
    vi.mocked(repository.claimNext).mockResolvedValue({
      id: "j1",
      type: "GENERATE_AI_SUMMARY",
      attempts: 5,
      payloadJson: { reviewVersionId: "v1" },
    });
    handler.run.mockRejectedValue(new RetryableJobError("AI_TIMEOUT"));

    await new JobRunner(repository, { GENERATE_AI_SUMMARY: handler }).runOnce();

    expect(repository.markDead).toHaveBeenCalledWith("j1", "AI_TIMEOUT");
    expect(repository.retry).not.toHaveBeenCalled();
  });

  it("schedules the second failure five minutes later", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T00:00:00Z"));
    vi.mocked(repository.claimNext).mockResolvedValue({
      id: "j2",
      type: "GENERATE_AI_SUMMARY",
      attempts: 2,
      payloadJson: { reviewVersionId: "v2" },
    });
    handler.run.mockRejectedValue(new RetryableJobError("AI_RATE_LIMIT"));

    await new JobRunner(repository, { GENERATE_AI_SUMMARY: handler }).runOnce();

    expect(repository.retry).toHaveBeenCalledWith("j2", "AI_RATE_LIMIT", new Date("2026-08-21T00:05:00Z"));
    vi.useRealTimers();
  });

  it("completes a successfully handled job", async () => {
    vi.mocked(repository.claimNext).mockResolvedValue({
      id: "j3",
      type: "GENERATE_AI_SUMMARY",
      attempts: 1,
      payloadJson: { reviewVersionId: "v3" },
    });
    handler.run.mockResolvedValue(undefined);

    await new JobRunner(repository, { GENERATE_AI_SUMMARY: handler }).runOnce();

    expect(repository.complete).toHaveBeenCalledWith("j3");
  });
});