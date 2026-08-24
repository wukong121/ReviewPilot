import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConcurrencyError, ReviewRepository } from "../src/review-repository";

describe("ReviewRepository", () => {
  const tx = {
    reviewVersion: { updateMany: vi.fn() },
    backgroundJob: { create: vi.fn() },
  };
  const repository = new ReviewRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    tx.reviewVersion.updateMany.mockResolvedValue({ count: 1 });
    tx.backgroundJob.create.mockResolvedValue({ id: "j1" });
  });

  it("freezes the version and enqueues AI in the same transaction", async () => {
    await repository.submitVersion(tx, {
      reviewVersionId: "00000000-0000-0000-0000-000000000001",
      expectedLockVersion: 2,
      immutableSnapshot: { answers: [] },
      submittedAt: new Date("2026-08-21T00:00:00Z"),
    });

    expect(tx.reviewVersion.updateMany).toHaveBeenCalledWith({
      where: {
        id: "00000000-0000-0000-0000-000000000001",
        lockVersion: 2,
        status: { in: ["DRAFT", "REVISION_DRAFT"] },
      },
      data: {
        status: "AI_PROCESSING",
        immutableSnapshotJson: { answers: [] },
        submittedAt: new Date("2026-08-21T00:00:00Z"),
        lockVersion: { increment: 1 },
      },
    });
    expect(tx.backgroundJob.create).toHaveBeenCalledWith({
      data: {
        type: "GENERATE_AI_SUMMARY",
        idempotencyKey: "ai:00000000-0000-0000-0000-000000000001",
        payloadJson: { reviewVersionId: "00000000-0000-0000-0000-000000000001" },
      },
    });
  });

  it("rejects a stale version without creating a job", async () => {
    tx.reviewVersion.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.submitVersion(tx, {
      reviewVersionId: "00000000-0000-0000-0000-000000000001",
      expectedLockVersion: 1,
      immutableSnapshot: {},
    })).rejects.toBeInstanceOf(ConcurrencyError);
    expect(tx.backgroundJob.create).not.toHaveBeenCalled();
  });
});