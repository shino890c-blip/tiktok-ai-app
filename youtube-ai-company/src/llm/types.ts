export type LLMPurpose = "research" | "script" | "quality_review" | "analysis";

export interface LLMRequest {
  purpose: LLMPurpose;
  system: string;
  prompt: string;
  /** Structured context. Real providers see it via `prompt`; the mock provider reads it directly. */
  context: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  provider: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** Every LLM backend implements this. Add new providers in src/llm/providers and register in factory.ts. */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(req: LLMRequest): Promise<LLMResponse>;
}
