import type { AppConfig } from "../config";
import { AnthropicLlm } from "./anthropic";
import { MockLlm } from "./mock";
import { OpenAiLlm } from "./openai";
import type { LlmProvider } from "./provider";

export * from "./provider";

export function createLlm(config: AppConfig): LlmProvider {
  switch (config.llm.provider) {
    case "anthropic":
      return new AnthropicLlm(config.llm.apiKey, config.llm.model);
    case "openai":
      return new OpenAiLlm(config.llm.apiKey, config.llm.model);
    case "mock":
    default:
      return new MockLlm();
  }
}
