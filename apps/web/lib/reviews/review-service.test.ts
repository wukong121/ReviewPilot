import { azureSsTemplateV1 } from "@employee-review/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ReviewService,
  type ReviewAnswerInput,
  type ReviewDraft,
  type ReviewStore,
} from "./review-service";

function completeAnswers(): Record<string, ReviewAnswerInput> {
  const answers: Record<string, ReviewAnswerInput> = {};
  for (const dimension of azureSsTemplateV1.dimensions) {
    for (const question of dimension.questions) {
      answers[question.id] = { numericValue: 4, textValue: "客户案例和数据证据" };
    }
    answers[dimension.bestThingQuestion.id] = { textValue: "主动推进重点机会并形成复用方法。" };
    answers[dimension.improvementQuestion.id] = { textValue: "进一步量化客户业务价值。" };
  }
  for (const capability of azureSsTemplateV1.capabilities) {
    answers[capability.id] = { numericValue: 4 };
  }
  for (const behavior of azureSsTemplateV1.behaviors) {
    answers[behavior.id] = { booleanValue: true };
  }
  for (const question of azureSsTemplateV1.openQuestions) {
    answers[question.id] = { textValue: "这是完整、具体且可供经理讨论的回答。" };
  }
  for (const check of azureSsTemplateV1.preparationChecks) {
    answers[check.id] = { booleanValue: false };
  }
  return answers;
}

describe("ReviewService", () => {
  const draft: ReviewDraft = {
    reviewId: "r1",
    reviewVersionId: "v1",
    employeeId: "e1",
    lockVersion: 5,
    status: "DRAFT",
    template: azureSsTemplateV1,
    answers: completeAnswers(),
  };
  const store: ReviewStore = {
    getOwnedDraft: vi.fn(),
    saveAnswers: vi.fn(),
    submitAtomic: vi.fn(),
  };
  const service = new ReviewService(store);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.getOwnedDraft).mockResolvedValue(draft);
    vi.mocked(store.saveAnswers).mockResolvedValue(6);
    vi.mocked(store.submitAtomic).mockResolvedValue(undefined);
  });

  it("saves only the employee's editable draft with optimistic locking", async () => {
    await service.saveDraft({
      actorId: "e1",
      reviewId: "r1",
      lockVersion: 5,
      answers: { "performance.acr-target": { numericValue: 4 } },
    });

    expect(store.saveAnswers).toHaveBeenCalledWith({
      actorId: "e1",
      reviewId: "r1",
      expectedLockVersion: 5,
      answers: { "performance.acr-target": { numericValue: 4 } },
    });
  });

  it("submits a complete review, stores scores, and enqueues AI atomically", async () => {
    const result = await service.submitReview({ actorId: "e1", reviewId: "r1", lockVersion: 5 });

    expect(result.status).toBe("AI_PROCESSING");
    expect(result.scores.weightedScore).toBe(4);
    expect(store.submitAtomic).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "e1",
      reviewVersionId: "v1",
      expectedLockVersion: 5,
      scores: expect.objectContaining({ weightedScore: 4, behaviorCount: 9 }),
      snapshot: expect.objectContaining({ answers: draft.answers }),
    }));
  });

  it("rejects a missing required open answer before starting a transaction", async () => {
    const incompleteDraft = { ...draft, answers: { ...draft.answers } };
    delete incompleteDraft.answers["open.biggest-bottleneck"];
    vi.mocked(store.getOwnedDraft).mockResolvedValue(incompleteDraft);

    await expect(service.submitReview({ actorId: "e1", reviewId: "r1", lockVersion: 5 }))
      .rejects.toThrow("open.biggest-bottleneck is required");
    expect(store.submitAtomic).not.toHaveBeenCalled();
  });
});