import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenerateAiSummaryHandler, type AiSummaryStore } from "./generate-ai-summary";
import type { AiSummaryProvider } from "../adapters/apim-ai-provider";

const summary = {
  overallSummary: "总体稳定。",
  dimensionSummaries: ["performance", "customer", "collaboration", "technical"].map((dimensionId) => ({
    dimensionId: dimensionId as "performance" | "customer" | "collaboration" | "technical",
    conclusion: "符合预期。",
    evidenceQuestionIds: [`${dimensionId}.evidence`],
  })),
  strengths: [{ title: "推进", description: "主动推进。", evidenceQuestionIds: ["performance.evidence"] }],
  improvements: [{ title: "量化", action: "补充数据。", evidenceQuestionIds: ["customer.evidence"] }],
  managerDiscussionTopics: [],
  supportNeeds: [],
  caveats: [],
};

describe("GenerateAiSummaryHandler", () => {
  const provider: AiSummaryProvider = { generate: vi.fn() };
  const store: AiSummaryStore = { loadFrozenVersion: vi.fn(), saveSummaryAtomic: vi.fn() };
  const handler = new GenerateAiSummaryHandler(provider, store, { modelId: "gpt-summary", promptVersion: "v1", schemaVersion: "v1" });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.loadFrozenVersion).mockResolvedValue({
      status: "AI_PROCESSING",
      snapshot: {
        answers: Object.fromEntries(["performance", "customer", "collaboration", "technical"].map((id) => [`${id}.evidence`, { textValue: "证据" }])),
      },
      alreadySummarized: false,
    });
    vi.mocked(provider.generate).mockResolvedValue(summary);
    vi.mocked(store.saveSummaryAtomic).mockResolvedValue(undefined);
  });

  it("stores the validated summary and enqueues manager mail atomically", async () => {
    await handler.run({ id: "j1", type: "GENERATE_AI_SUMMARY", attempts: 1, payloadJson: { reviewVersionId: "v1" } });

    expect(store.saveSummaryAtomic).toHaveBeenCalledWith(expect.objectContaining({
      reviewVersionId: "v1",
      summary,
      modelId: "gpt-summary",
    }));
  });

  it("rejects evidence IDs absent from the frozen snapshot", async () => {
    vi.mocked(provider.generate).mockResolvedValue({
      ...summary,
      strengths: [{ ...summary.strengths[0], evidenceQuestionIds: ["invented.question"] }],
    });

    await expect(handler.run({ id: "j2", type: "GENERATE_AI_SUMMARY", attempts: 1, payloadJson: { reviewVersionId: "v1" } }))
      .rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
    expect(store.saveSummaryAtomic).not.toHaveBeenCalled();
  });
});