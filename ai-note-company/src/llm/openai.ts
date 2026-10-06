import { LlmError, type LlmProvider, type LlmRequest } from "./provider";

/** Minimal OpenAI Chat Completions provider (plain fetch, no SDK). */
export class OpenAiLlm implements LlmProvider {
  readonly name = "openai";
  readonly isMock = false;

  constructor(private readonly apiKey: string, private readonly model: string, private readonly baseUrl = "https://api.openai.com/v1") {
    if (!apiKey) throw new LlmError("LLM_API_KEY is required for LLM_PROVIDER=openai", false);
  }

  async generateText(req: LlmRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        max_completion_tokens: req.maxTokens ?? 16000,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.prompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new LlmError(`OpenAI error ${res.status}: ${body.slice(0, 300)}`, res.status === 429 || res.status >= 500);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new LlmError("Empty response from OpenAI", true);
    return text;
  }
}
