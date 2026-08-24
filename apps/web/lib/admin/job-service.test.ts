import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobService, type AdminJobRepository } from "./job-service";

describe("JobService", () => {
  const repository: AdminJobRepository = { findById: vi.fn(), requeue: vi.fn() };
  const service = new JobService(repository);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repository.findById).mockResolvedValue({ id: "j1", status: "DEAD", lastErrorCode: "AI_TIMEOUT" });
  });

  it("allows an admin to retry only DEAD jobs", async () => {
    await service.retry("j1", { id: "a1", roles: ["ADMIN"] });
    expect(repository.requeue).toHaveBeenCalledWith("j1", "a1");

    vi.mocked(repository.findById).mockResolvedValue({ id: "j2", status: "PROCESSING", lastErrorCode: null });
    await expect(service.retry("j2", { id: "a1", roles: ["ADMIN"] })).rejects.toThrow("job is not DEAD");
  });
});
