import Anthropic from "@anthropic-ai/sdk";
import { LlmError, type LlmProvider, type LlmRequest } from "./provider";

// Models that accept the server-side refusal fallback ("default" routing).
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

export class AnthropicLlm implements LlmProvider {
  readonly name = "anthropic";
  readonly isMock = false;
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model: string) {
    // Empty apiKey → SDK resolves ANTHROPIC_API_KEY / profile from the environment.
    this.client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }

  async generateText(req: LlmRequest): Promise<string> {
    const useFallback = FALLBACK_MODELS.has(this.model);
    try {
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: req.maxTokens ?? 32000,
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
        output_config: { effort: req.task === "writing" || req.task === "revision" ? "high" : "medium" },
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") {
        throw new LlmError(`Model refused the request (${msg.stop_details?.category ?? "unknown"})`, false);
      }
      const text = msg.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (!text.trim()) throw new LlmError(`Empty response (stop_reason=${msg.stop_reason})`, true);
      if (msg.stop_reason === "max_tokens") throw new LlmError("Response truncated by max_tokens", true);
      return text;
    } catch (e) {
      if (e instanceof LlmError) throw e;
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new LlmError(`Anthropic auth error: ${e.message}`, false);
      }
      if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError) {
        throw new LlmError(`Anthropic request error: ${e.message}`, false);
      }
      if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.InternalServerError) {
        throw new LlmError(`Anthropic transient error: ${e.message}`, true);
      }
      if (e instanceof Anthropic.APIError) throw new LlmError(`Anthropic API error ${e.status}: ${e.message}`, true);
      throw e;
    }
  }
}
