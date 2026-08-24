import { prisma } from "@employee-review/db";

import { can, type Actor } from "../auth/permissions";

export interface AnalyticsFilters {
  cycleId?: string;
  status?: string;
  employeeId?: string;
  approverManagerId?: string;
}

type Dimensions = Record<"performance" | "customer" | "collaboration" | "technical", number>;

export interface AnalyticsRow {
  reviewId: string;
  employeeId: string;
  employeeName: string;
  approverManagerId: string;
  cycleId: string;
  cycleName: string;
  status: string;
  weightedScore: number | null;
  dimensionScores: Dimensions | null;
  capabilityScores: number[];
  behaviorChecks: boolean[];
}

export interface AnalyticsRepository {
  fetchRows(filters: AnalyticsFilters): Promise<AnalyticsRow[]>;
}

const roundOne = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;

export class AnalyticsService {
  constructor(private readonly repository: AnalyticsRepository) {}

  async getDashboard(filters: AnalyticsFilters, actor: Actor) {
    if (!can(actor, "analytics:read")) throw new Error("forbidden");
    const rows = await this.repository.fetchRows(filters);
    const scored = rows.filter((row): row is AnalyticsRow & { weightedScore: number; dimensionScores: Dimensions } =>
      row.weightedScore !== null && row.dimensionScores !== null,
    );
    const average = (values: number[]) => values.length ? roundOne(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    const statuses = rows.map((row) => row.status);
    const cycleGroups = new Map<string, typeof scored>();
    for (const row of scored) {
      cycleGroups.set(row.cycleId, [...(cycleGroups.get(row.cycleId) ?? []), row]);
    }

    return {
      kpis: {
        participantCount: rows.length,
        submittedCount: statuses.filter((status) => !["DRAFT", "REVISION_DRAFT"].includes(status)).length,
        pendingReviewCount: statuses.filter((status) => status === "PENDING_REVIEW").length,
        approvedCount: statuses.filter((status) => status === "APPROVED").length,
        rejectedCount: statuses.filter((status) => status === "REJECTED").length,
      },
      teamWeightedAverage: average(scored.map((row) => row.weightedScore)),
      distribution: [
        { label: "1.0-1.9", count: scored.filter((row) => row.weightedScore < 2).length },
        { label: "2.0-2.9", count: scored.filter((row) => row.weightedScore >= 2 && row.weightedScore < 3).length },
        { label: "3.0-3.9", count: scored.filter((row) => row.weightedScore >= 3 && row.weightedScore < 4).length },
        { label: "4.0-5.0", count: scored.filter((row) => row.weightedScore >= 4).length },
      ],
      heatmap: scored.map((row) => ({
        reviewId: row.reviewId,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        dimensions: Object.fromEntries(Object.entries(row.dimensionScores).map(([key, value]) => [key, roundOne(value)])) as Dimensions,
      })),
      capabilityAverages: Array.from({ length: 7 }, (_, index) =>
        average(scored.map((row) => row.capabilityScores[index]).filter((value): value is number => value !== undefined)),
      ),
      behaviorRates: Array.from({ length: 9 }, (_, index) => {
        const answers = scored.map((row) => row.behaviorChecks[index]).filter((value): value is boolean => value !== undefined);
        return answers.length ? roundOne(answers.filter(Boolean).length / answers.length * 100) : null;
      }),
      cycleTrends: Array.from(cycleGroups.values()).map((cycleRows) => ({
        cycleId: cycleRows[0].cycleId,
        cycleName: cycleRows[0].cycleName,
        weightedAverage: average(cycleRows.map((row) => row.weightedScore)),
      })),
      statusTable: rows.map((row) => ({
        reviewId: row.reviewId,
        employeeName: row.employeeName,
        cycleName: row.cycleName,
        status: row.status,
        weightedScore: row.weightedScore,
        dimensions: row.dimensionScores,
      })),
    };
  }
}

function extractSnapshotArrays(snapshot: unknown): { capabilityScores: number[]; behaviorChecks: boolean[] } {
  if (!snapshot || typeof snapshot !== "object" || !("answers" in snapshot) || !("template" in snapshot)) {
    return { capabilityScores: [], behaviorChecks: [] };
  }
  const value = snapshot as {
    answers?: Record<string, { numericValue?: number; booleanValue?: boolean }>;
    template?: { capabilities?: Array<{ id: string }>; behaviors?: Array<{ id: string }> };
  };
  return {
    capabilityScores: value.template?.capabilities?.map(({ id }) => value.answers?.[id]?.numericValue).filter((item): item is number => item !== undefined) ?? [],
    behaviorChecks: value.template?.behaviors?.map(({ id }) => value.answers?.[id]?.booleanValue === true) ?? [],
  };
}

class PrismaAnalyticsRepository implements AnalyticsRepository {
  async fetchRows(filters: AnalyticsFilters): Promise<AnalyticsRow[]> {
    const reviews = await prisma.review.findMany({
      where: {
        cycleId: filters.cycleId,
        employeeId: filters.employeeId,
        approverManagerId: filters.approverManagerId,
      },
      include: {
        employee: { select: { displayName: true } },
        cycle: { select: { id: true, name: true } },
        versions: { include: { computedScore: true } },
      },
      take: 500,
    });

    return reviews.flatMap((review) => {
      const version = review.versions.find((item) => item.id === review.currentVersionId);
      if (!version || (filters.status && version.status !== filters.status)) return [];
      const snapshotValues = extractSnapshotArrays(version.immutableSnapshotJson);
      return [{
        reviewId: review.id,
        employeeId: review.employeeId,
        employeeName: review.employee.displayName,
        approverManagerId: review.approverManagerId,
        cycleId: review.cycle.id,
        cycleName: review.cycle.name,
        status: version.status,
        weightedScore: version.computedScore ? Number(version.computedScore.weightedScore) : null,
        dimensionScores: version.computedScore?.dimensionScoresJson as Dimensions | null ?? null,
        ...snapshotValues,
      }];
    });
  }
}

export const analyticsService = new AnalyticsService(new PrismaAnalyticsRepository());
