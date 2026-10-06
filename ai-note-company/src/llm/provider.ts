export type LlmTask = "research" | "strategy" | "writing" | "revision" | "quality_review" | "analytics_review";

export interface LlmRequest {
  task: LlmTask;
  system: string;
  prompt: string;
  /** Structured input. Real providers ignore it (it is already in `prompt`); MockLlm uses it. */
  context?: unknown;
  maxTokens?: number;
}

export interface LlmProvider {
  readonly name: string;
  readonly isMock: boolean;
  generateText(req: LlmRequest): Promise<string>;
}

export class LlmError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "LlmError";
  }
}

/** Extracts the first JSON object/array from model output (handles ```json fences). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start < 0) throw new Error("No JSON found in LLM output");
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(candidate.slice(start, i + 1));
    }
  }
  throw new Error("Unterminated JSON in LLM output");
}

/**
 * Asks for JSON, validates it, and re-asks once with the validation error if
 * the first answer is unusable.
 */
export async function generateJson<T>(llm: LlmProvider, req: LlmRequest, validate: (v: unknown) => T): Promise<T> {
  let lastErr: unknown;
  let prompt = req.prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await llm.generateText({ ...req, prompt });
    try {
      return validate(extractJson(text));
    } catch (e) {
      lastErr = e;
      prompt = `${req.prompt}\n\n前回の出力はJSONとして不正でした（${(e as Error).message}）。説明文なしでJSONのみを出力してください。`;
    }
  }
  throw new LlmError(`LLM returned invalid JSON: ${(lastErr as Error)?.message}`, true);
}
