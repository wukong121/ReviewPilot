import { AiSummarySchema, type AiSummary } from "@employee-review/domain";

export interface AiSummaryInput {
  snapshot: unknown;
}

export interface AiSummaryProvider {
  generate(input: AiSummaryInput): Promise<AiSummary>;
}

interface ApimAiConfig {
  baseUrl: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  timeoutMs?: number;
}

interface ProviderDependencies {
  fetcher?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
}

export class AiProviderError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
    this.name = "AiProviderError";
  }
}

function modelContent(body: unknown): string {
  if (!body || typeof body !== "object" || !("choices" in body) || !Array.isArray(body.choices)) {
    throw new AiProviderError("AI_INVALID_RESPONSE", true);
  }
  const content = (body.choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
  if (typeof content !== "string") {
    throw new AiProviderError("AI_INVALID_RESPONSE", true);
  }
  return content;
}

export class ApimAiProvider implements AiSummaryProvider {
  private readonly fetcher: typeof fetch;
  private readonly wait: (milliseconds: number) => Promise<void>;

  constructor(private readonly config: ApimAiConfig, dependencies: ProviderDependencies = {}) {
    this.fetcher = dependencies.fetcher ?? fetch;
    this.wait = dependencies.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async generate(input: AiSummaryInput): Promise<AiSummary> {
    const baseUrl = this.config.baseUrl.endsWith("/")
      ? this.config.baseUrl
      : `${this.config.baseUrl}/`;
    const url = new URL(
      `openai/deployments/${encodeURIComponent(this.config.deployment)}/chat/completions`,
      baseUrl,
    );
    url.searchParams.set("api-version", this.config.apiVersion);
    const requestBody = {
      messages: [
        {
          role: "system",
          content: [
            "你是员工自评辅助总结工具，只能总结输入中存在的事实。",
            "不得推断敏感属性，不得给出薪酬、晋升、裁员、纪律处分或审批结论。",
            "不得重新计算或修改系统分数。每个优势、改进点和维度总结必须引用输入中的问题 ID。",
            "只返回符合约定 Schema 的 JSON 对象，不要 Markdown。",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(input.snapshot) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 60_000);
      try {
        const response = await this.fetcher(url, {
          method: "POST",
          headers: { "api-key": this.config.apiKey, "content-type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          throw new AiProviderError("AI_AUTH", false);
        }
        if (response.status === 429 || response.status >= 500) {
          if (attempt === 0) {
            await this.wait(250);
            continue;
          }
          throw new AiProviderError(response.status === 429 ? "AI_RATE_LIMIT" : "AI_UPSTREAM", true);
        }
        if (!response.ok) {
          throw new AiProviderError("AI_UPSTREAM", false);
        }

        const body: unknown = await response.json();
        let parsed: unknown;
        try {
          parsed = JSON.parse(modelContent(body));
        } catch (error) {
          if (error instanceof AiProviderError) throw error;
          throw new AiProviderError("AI_INVALID_RESPONSE", true);
        }
        const summary = AiSummarySchema.safeParse(parsed);
        if (!summary.success) {
          throw new AiProviderError("AI_INVALID_RESPONSE", true);
        }
        return summary.data;
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
          throw new AiProviderError("AI_TIMEOUT", true);
        }
        throw new AiProviderError("AI_UPSTREAM", true);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new AiProviderError("AI_UPSTREAM", true);
  }
}
