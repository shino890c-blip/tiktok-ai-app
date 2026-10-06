import { ExternalApiError } from "../../core/errors.js";
import type { LLMProvider, LLMRequest, LLMResponse } from "../types.js";
import { postJson } from "./http.js";

interface AnthropicMessageResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}

/** Anthropic Messages API (https://docs.anthropic.com). Model comes from LLM_MODEL. */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly opts: { timeoutMs: number; maxTokens: number; temperature: number; fetchImpl?: typeof fetch },
  ) {}

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const data = (await postJson(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: this.model,
        max_tokens: req.maxTokens ?? this.opts.maxTokens,
        temperature: req.temperature ?? this.opts.temperature,
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
      },
      this.opts.timeoutMs,
      this.opts.fetchImpl,
    )) as AnthropicMessageResponse;
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    if (!text) throw new ExternalApiError("Anthropic returned an empty response", undefined, true);
    return {
      text,
      provider: this.name,
      model: this.model,
      usage: { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens },
    };
  }
}
