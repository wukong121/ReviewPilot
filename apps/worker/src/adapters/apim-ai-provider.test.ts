import { describe, expect, it, vi } from "vitest";

import { ApimAiProvider, AiProviderError } from "./apim-ai-provider";

const validSummary = {
  overallSummary: "总体表现稳定。",
  dimensionSummaries: ["performance", "customer", "collaboration", "technical"].map((dimensionId) => ({
    dimensionId,
    conclusion: "符合预期。",
    evidenceQuestionIds: [`${dimensionId}.evidence`],
  })),
  strengths: [{ title: "推进", description: "主动推进。", evidenceQuestionIds: ["performance.evidence"] }],
  improvements: [{ title: "量化", action: "补充数据。", evidenceQuestionIds: ["customer.evidence"] }],
  managerDiscussionTopics: [],
  supportNeeds: [],
  caveats: [],
};

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("ApimAiProvider", () => {
  it("uses the APIM v1 chat route and sends the model with its configured key header", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response(200, { choices: [{ message: { content: JSON.stringify(validSummary) } }] }),
    );
    const provider = new ApimAiProvider({
      baseUrl: "https://ai-gateway.example.test/wangpeter-2401-ai-resource",
      apiKey: "test-key",
      deployment: "gpt-5.5",
    }, { fetcher, wait: vi.fn() });

    await provider.generate({ snapshot: {} });

    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://ai-gateway.example.test/wangpeter-2401-ai-resource/openai/v1/chat/completions",
    );
    expect(new Headers(init.headers).get("api-key")).toBe("test-key");
    const requestBody = JSON.parse(init.body as string);
    expect(requestBody.model).toBe("gpt-5.5");
    expect(requestBody).not.toHaveProperty("temperature");
    expect(requestBody.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "employee_review_summary",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: expect.arrayContaining(["overallSummary", "dimensionSummaries", "strengths"]),
        },
      },
    });
  });

  it("retries 429 and validates the final JSON response", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(429, { error: "rate limited" }))
      .mockResolvedValueOnce(response(200, { choices: [{ message: { content: JSON.stringify(validSummary) } }] }));
    const provider = new ApimAiProvider({
      baseUrl: "https://apim.example.test",
      apiKey: "test-key",
      deployment: "summary-model",
    }, { fetcher, wait: vi.fn() });

    await expect(provider.generate({ snapshot: { answers: [] } })).resolves.toEqual(validSummary);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("classifies malformed model JSON as retryable", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, { choices: [{ message: { content: "not-json" } }] }));
    const provider = new ApimAiProvider({ baseUrl: "https://apim.test", apiKey: "key", deployment: "model" }, { fetcher, wait: vi.fn() });

    await expect(provider.generate({ snapshot: {} })).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE", retryable: true });
  });

  it("classifies a 401 as a permanent authentication error", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(401, { error: "invalid key" }));
    const provider = new ApimAiProvider({ baseUrl: "https://apim.test", apiKey: "key", deployment: "model" }, { fetcher, wait: vi.fn() });

    await expect(provider.generate({ snapshot: {} })).rejects.toEqual(expect.objectContaining<Partial<AiProviderError>>({ code: "AI_AUTH", retryable: false }));
  });
});