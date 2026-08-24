import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyticsService, type AnalyticsRepository } from "./analytics-service";

describe("AnalyticsService", () => {
  const repository: AnalyticsRepository = { fetchRows: vi.fn() };
  const service = new AnalyticsService(repository);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repository.fetchRows).mockResolvedValue([
      {
        reviewId: "r1", employeeId: "e1", employeeName: "张三", approverManagerId: "m1",
        cycleId: "c1", cycleName: "FY27 Q1", status: "PENDING_REVIEW", weightedScore: 4,
        dimensionScores: { performance: 4.2, customer: 4, collaboration: 3.8, technical: 4 },
        capabilityScores: [4, 4, 3, 4, 5, 3, 4], behaviorChecks: [true, true, true, true, true, true, true, false, false],
      },
      {
        reviewId: "r2", employeeId: "e2", employeeName: "李四", approverManagerId: "m1",
        cycleId: "c1", cycleName: "FY27 Q1", status: "APPROVED", weightedScore: 3.5,
        dimensionScores: { performance: 3.5, customer: 3.8, collaboration: 3, technical: 4 },
        capabilityScores: [3, 4, 3, 3, 4, 3, 4], behaviorChecks: [true, true, true, true, true, false, false, false, false],
      },
    ]);
  });

  it("returns weighted metrics and four-dimensional employee heatmap rows", async () => {
    const dashboard = await service.getDashboard({ cycleId: "c1" }, { id: "m1", roles: ["MANAGER"] });

    expect(dashboard.kpis).toMatchObject({ participantCount: 2, pendingReviewCount: 1, approvedCount: 1 });
    expect(dashboard.teamWeightedAverage).toBe(3.8);
    expect(dashboard.heatmap[0].dimensions).toEqual(expect.objectContaining({
      performance: expect.any(Number), customer: expect.any(Number),
      collaboration: expect.any(Number), technical: expect.any(Number),
    }));
  });

  it("denies employee analytics before querying", async () => {
    await expect(service.getDashboard({ cycleId: "c1" }, { id: "e1", roles: ["EMPLOYEE"] }))
      .rejects.toThrow("forbidden");
    expect(repository.fetchRows).not.toHaveBeenCalled();
  });
});