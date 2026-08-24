import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApprovalService, type ApprovalStore } from "./approval-service";

describe("ApprovalService", () => {
  const store: ApprovalStore = {
    getDecisionContext: vi.fn(),
    approveAtomic: vi.fn(),
    rejectAtomic: vi.fn(),
  };
  const service = new ApprovalService(store);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.getDecisionContext).mockResolvedValue({
      reviewId: "r1",
      reviewVersionId: "v1",
      version: 1,
      status: "PENDING_REVIEW",
      lockVersion: 3,
      employeeId: "e1",
      approverManagerId: "m1",
      answers: [{ questionId: "open.achievement", textValue: "完成重点项目" }],
    });
    vi.mocked(store.approveAtomic).mockResolvedValue({ status: "APPROVED" });
    vi.mocked(store.rejectAtomic).mockResolvedValue({
      rejectedVersion: { id: "v1", status: "REJECTED" },
      newVersion: { id: "v2", version: 2, status: "REVISION_DRAFT", answers: [{ questionId: "open.achievement", textValue: "完成重点项目" }] },
    });
  });

  it("requires a comment and the snapshotted approver", async () => {
    await expect(service.approve({ actorId: "m2", versionId: "v1", comment: "", lockVersion: 3 }))
      .rejects.toThrow("comment is required");
    await expect(service.approve({ actorId: "m2", versionId: "v1", comment: "通过", lockVersion: 3 }))
      .rejects.toThrow("only the assigned manager can decide");
    expect(store.approveAtomic).not.toHaveBeenCalled();
  });

  it("approves a pending version atomically", async () => {
    await expect(service.approve({ actorId: "m1", versionId: "v1", comment: "目标达成", lockVersion: 3 }))
      .resolves.toEqual({ status: "APPROVED" });
    expect(store.approveAtomic).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "m1",
      versionId: "v1",
      expectedLockVersion: 3,
      comment: "目标达成",
    }));
  });

  it("rejects and creates a copied revision draft", async () => {
    const result = await service.reject({ actorId: "m1", versionId: "v1", comment: "补充客户证据", lockVersion: 3 });

    expect(result.rejectedVersion.status).toBe("REJECTED");
    expect(result.newVersion).toMatchObject({ version: 2, status: "REVISION_DRAFT" });
    expect(result.newVersion.answers).toEqual([{ questionId: "open.achievement", textValue: "完成重点项目" }]);
  });
});