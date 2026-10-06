import { readFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import type { AppConfig } from "../config/index.js";
import { ConfigError, ValidationError } from "../core/errors.js";
import { withBackoff } from "../core/retry.js";
import type { Logger } from "../logging/logger.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { MockLLMProvider } from "./providers/mock.js";
import { OpenAIProvider } from "./providers/openai.js";
import type { LLMProvider, LLMRequest } from "./types.js";

export type { LLMProvider, LLMRequest, LLMResponse, LLMPurpose } from "./types.js";
export { MockLLMProvider } from "./providers/mock.js";

export function createLLMProvider(config: AppConfig): LLMProvider {
  const { llm } = config;
  switch (llm.provider) {
    case "mock":
      return new MockLLMProvider(llm.model);
    case "anthropic":
      if (!llm.anthropicApiKey) throw new ConfigError("ANTHROPIC_API_KEY is not set");
      return new AnthropicProvider(llm.anthropicApiKey, llm.model, llm);
    case "openai":
      if (!llm.openaiApiKey) throw new ConfigError("OPENAI_API_KEY is not set");
      return new OpenAIProvider(llm.openaiApiKey, llm.model, { ...llm, baseUrl: llm.openaiBaseUrl });
    default:
      throw new ConfigError(`Unknown LLM provider: ${String(llm.provider)}`);
  }
}

/** Extracts the first JSON object from model output (tolerates ```json fences and surrounding prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new ValidationError("LLM output contained no JSON object");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    throw new ValidationError(`LLM output was not valid JSON: ${(err as Error).message}`);
  }
}

/**
 * Calls the LLM and validates the JSON result against a schema. Transient API errors are
 * retried with exponential backoff; a schema-invalid answer is retried once with the
 * validation error fed back to the model.
 */
export async function completeJson<S extends z.ZodType>(
  llm: LLMProvider,
  req: LLMRequest,
  schema: S,
  logger: Logger,
  opts: { apiRetries?: number; baseDelayMs?: number } = {},
): Promise<z.infer<S>> {
  let lastError: unknown;
  let prompt = req.prompt;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await withBackoff(() => llm.complete({ ...req, prompt }), {
      retries: opts.apiRetries ?? 3,
      baseDelayMs: opts.baseDelayMs ?? 2000,
      onRetry: (err, n, delay) =>
        logger.warn("llm.retry", `LLM call failed, retrying in ${delay}ms`, { attempt: n, error: String(err) }),
    });
    logger.debug("llm.response", `LLM ${res.provider}/${res.model} responded`, { purpose: req.purpose, usage: res.usage });
    try {
      const parsed = schema.safeParse(extractJson(res.text));
      if (parsed.success) return parsed.data;
      throw new ValidationError(`LLM output failed schema validation: ${parsed.error.message.slice(0, 800)}`);
    } catch (err) {
      lastError = err;
      logger.warn("llm.invalid_output", "LLM output invalid, requesting correction", {
        purpose: req.purpose,
        attempt,
        error: String(err),
      });
      prompt = `${req.prompt}\n\n前回の出力は次の理由で無効でした。スキーマに厳密に従ったJSONのみを出力してください:\n${String(err)}`;
    }
  }
  throw lastError;
}

/** Loads role prompts from prompts/*.md and fills {{placeholders}}. */
export class PromptLoader {
  private cache = new Map<string, string>();
  constructor(private readonly dir: string) {}

  load(name: string, vars: Record<string, string | number> = {}): string {
    let tpl = this.cache.get(name);
    if (tpl === undefined) {
      const file = path.join(this.dir, `${name}.md`);
      try {
        tpl = readFileSync(file, "utf8");
      } catch {
        throw new ConfigError(`Prompt file not found: ${file}`);
      }
      this.cache.set(name, tpl);
    }
    return tpl.replace(/\{\{(\w+)\}\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
  }
}
