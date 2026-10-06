import type { Agent, AgentContext, AgentResult } from "../base";
import { throwIfAborted } from "../base";
import { generateJson } from "../../llm/provider";
import { KnowledgeBase } from "../../knowledge/knowledgeBase";
import { researchPrompt, type TrendSignal } from "../../prompts";
import type { Idea, Task } from "../../types";
import { localDateKey, newId } from "../../utils";
import { obj, num, str, strArr } from "../validate";
import { buildSources, type SourceResult, type TrendSource } from "./sources";

export function validateIdeas(v: unknown): Omit<Idea, "idea_id">[] {
  const root = obj(v, "research output");
  const ideas = Array.isArray(root.ideas) ? root.ideas : [];
  if (!ideas.length) throw new Error("ideas[] is empty");
  return ideas.map((raw, i) => {
    const o = obj(raw, `ideas[${i}]`);
    return {
      topic: str(o, "topic"),
      target_reader: str(o, "target_reader"),
      reader_problem: str(o, "reader_problem"),
      trend_reason: str(o, "trend_reason"),
      unique_angle: str(o, "unique_angle"),
      title_candidates: strArr(o, "title_candidates", { min: 1 }),
      monetization_potential: num(o, "monetization_potential", 0, 100, 50),
      confidence: num(o, "confidence", 0, 100, 50),
      sources: strArr(o, "sources"),
    };
  });
}

/**
 * RESEARCHER: collects trend signals (only from sources that actually
 * responded), asks the LLM *why* a theme could be read, and picks one idea.
 */
export class Researcher implements Agent {
  readonly name = "researcher" as const;
  constructor(private readonly ctx: AgentContext, private readonly sourcesOverride?: TrendSource[]) {}

  async handle(task: Task, signal: AbortSignal): Promise<AgentResult> {
    const { repo, llm, config, logger } = this.ctx;
    const kb = new KnowledgeBase(repo);
    const knowledge = kb.summarize();
    const sources = this.sourcesOverride ?? buildSources(config, knowledge);

    const results: SourceResult[] = await Promise.all(sources.map((s) => s.fetch()));
    throwIfAborted(signal);
    // Candidates generated after the previous article's analysis feed the next research.
    const pastCandidates = repo
      .listIdeas(20)
      .filter((i) => !i.selected)
      .slice(0, 6)
      .map((i): TrendSignal => ({ source: "candidates", title: i.topic, summary: i.trend_reason }));
    const signals: TrendSignal[] = [...pastCandidates, ...results.flatMap((r) => r.signals)].slice(0, 60);
    const sourceReport = results.map((r) => ({ source: r.source, ok: r.ok, count: r.signals.length, error: r.error, skipped: r.skipped }));
    for (const r of results.filter((r) => !r.ok && r.error)) logger.warn(`research source failed: ${r.source}`, { error: r.error });

    const recentTopics = repo.recentTopics(30);
    const count = Number(task.input.count ?? 3);
    const { system, prompt } = researchPrompt({ signals, knowledge, recentTopics, count, today: localDateKey() });
    const ideas = await generateJson(llm, { task: "research", system, prompt, context: { signals, knowledge, recentTopics, count, today: localDateKey() } }, validateIdeas);
    throwIfAborted(signal);

    const saved: Idea[] = ideas.map((i) => ({ ...i, idea_id: newId("idea") }));
    if (task.input.mode === "candidates") {
      repo.db.transaction(() => saved.forEach((i) => repo.saveIdea(i, null)));
      return { kind: "completed", output: { mode: "candidates", idea_ids: saved.map((i) => i.idea_id), topics: saved.map((i) => i.topic), knowledge_articles: knowledge.article_count, source_report: sourceReport } };
    }
    const fresh = saved.filter((i) => !recentTopics.includes(i.topic));
    const candidates = fresh.length ? fresh : saved;
    const best = [...candidates].sort((a, b) => b.confidence * 0.6 + b.monetization_potential * 0.4 - (a.confidence * 0.6 + a.monetization_potential * 0.4))[0];

    repo.db.transaction(() => {
      for (const i of saved) repo.saveIdea(i, task.pipeline_id);
      repo.markIdeaSelected(best.idea_id);
    });
    logger.info(`selected idea: ${best.topic}`);
    return { kind: "completed", output: { idea_id: best.idea_id, idea_ids: saved.map((i) => i.idea_id), topic: best.topic, source_report: sourceReport } };
  }
}
