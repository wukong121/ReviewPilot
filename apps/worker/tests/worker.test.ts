import { describe, expect, it, vi } from "vitest";

import { startWorker } from "../src/index";

describe("startWorker", () => {
  it("polls once when configured for a single run", async () => {
    const poll = vi.fn().mockResolvedValue(undefined);

    await startWorker({ poll, once: true });

    expect(poll).toHaveBeenCalledTimes(1);
  });
});