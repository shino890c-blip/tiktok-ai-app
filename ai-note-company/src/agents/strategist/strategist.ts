import type { ArticleMode } from "../../config";
import { generateJson } from "../../llm/provider";
import { KnowledgeBase } from "../../knowledge/knowledgeBase";
import { strategyPrompt } from "../../prompts";
import type { OutlineSection, Strategy, Task } from "../../types";
import { newId } from "../../utils";
import type { Agent, AgentContext, AgentResult } from "../base";
import { NonRetryableError } from "../base";
import { num, obj, str, strArr } from "../validate";

const MODES: ArticleMode[] = ["FREE", "PAID", "DRAFT", "PARTIAL_PAID"];

export function validateStrategy(v: unknown, defaults: { mode: ArticleMode; price: number }): Omit<Strategy, "strategy_id" | "idea_id"> {
  const o = obj(v, "strategy");
  const rawOutline = Array.isArray(o.outline) ? o.outline : [];
  const outline: OutlineSection[] = rawOutline.map((s, i) => {
    const so = obj(s, `outline[${i}]`);
    return { heading: str(so, "heading"), points: strArr(so, "points"), paid: so.paid === true };
  });
  if (outline.length < 2) throw new Error("outline must have at least 2 sections");

  let mode = (typeof o.article_mode === "string" && MODES.includes(o.article_mode as ArticleMode) ? o.article_mode : defaults.mode) as ArticleMode;
  let contentType: "free" | "paid" = o.content_type === "paid" ? "paid" : "free";
  if (mode === "FREE" || mode === "DRAFT") contentType = "free";
  if (contentType === "paid" && mode !== "PAID" && mode !== "PARTIAL_PAID") mode = "PARTIAL_PAID";

  // Free articles never carry paid sections; paid ones need at least one free and one paid section.
  if (contentType === "free") outline.forEach((s) => (s.paid = false));
  if (contentType === "paid") {
    if (!outline.some((s) => s.paid)) outline[outline.length - 1].paid = true;
    if (outline.every((s) => s.paid)) outline[0].paid = false;
  }
  const price = contentType === "paid" ? Math.round(num(o, "price", 100, 50000, defaults.price)) : 0;

  return {
    content_type: contentType,
    article_mode: mode,
    title: str(o, "title"),
    subtitle: str(o, "subtitle", { optional: true }),
    purpose: str(o, "purpose", { optional: true }),
    outline,
    free_value: str(o, "free_value"),
    paid_value: contentType === "paid" ? str(o, "paid_value") : str(o, "paid_value", { optional: true }),
    price,
    cta: str(o, "cta"),
    target_reader: str(o, "target_reader"),
    reader_takeaway: str(o, "reader_takeaway", { optional: true }) || "読み終えたら1つ行動に移せる",
  };
}

/** STRATEGIST: turns a researched idea into an article plan (free/paid, outline, price, CTA). */
export class Strategist implements Agent {
  readonly name = "strategist" as const;
  constructor(private readonly ctx: AgentContext) {}

  async handle(task: Task): Promise<AgentResult> {
    const { repo, llm, config } = this.ctx;
    const ideaId = String(task.input.idea_id ?? "");
    const idea = repo.getIdea(ideaId);
    if (!idea) throw new NonRetryableError(`idea not found: ${ideaId}`);
    const knowledge = new KnowledgeBase(repo).summarize();
    const defaultMode = (task.input.mode as ArticleMode) ?? config.defaultArticleMode;
    const defaults = { mode: defaultMode, price: config.defaultArticlePrice };
    const ctx = { idea, knowledge, defaultMode, defaultPrice: config.defaultArticlePrice };
    const { system, prompt } = strategyPrompt(ctx);
    const s = await generateJson(llm, { task: "strategy", system, prompt, context: ctx }, (v) => validateStrategy(v, defaults));
    const strategy: Strategy = { ...s, strategy_id: newId("strat"), idea_id: idea.idea_id };
    repo.saveStrategy(strategy);
    return { kind: "completed", output: { strategy_id: strategy.strategy_id, idea_id: idea.idea_id, title: strategy.title, content_type: strategy.content_type, price: strategy.price } };
  }
}
