import { ExternalApiError } from "../../core/errors.js";
import type { LLMProvider, LLMRequest, LLMResponse } from "../types.js";
import { postJson } from "./http.js";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** OpenAI-compatible Chat Completions API (works with any compatible base URL). */
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly opts: { baseUrl: string; timeoutMs: number; maxTokens: number; temperature: number; fetchImpl?: typeof fetch },
  ) {}

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const data = (await postJson(
      `${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`,
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        max_tokens: req.maxTokens ?? this.opts.maxTokens,
        temperature: req.temperature ?? this.opts.temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.prompt },
        ],
      },
      this.opts.timeoutMs,
      this.opts.fetchImpl,
    )) as ChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new ExternalApiError("OpenAI returned an empty response", undefined, true);
    return {
      text,
      provider: this.name,
      model: this.model,
      usage: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens },
    };
  }
}
