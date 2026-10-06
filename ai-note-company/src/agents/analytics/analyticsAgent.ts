import type { MetricsCollector } from "../../analytics/collectors";
import { ruleBasedReview, scorePerformance, type Baseline } from "../../analytics/scoring";
import { generateJson } from "../../llm/provider";
import { analyticsReviewPrompt } from "../../prompts";
import type { AnalyticsResult, Task } from "../../types";
import type { Agent, AgentContext, AgentResult } from "../base";
import { NonRetryableError } from "../base";
import { strArr } from "../validate";

/** ANALYTICS: reads real metrics (or clearly-flagged simulations) and evaluates the article. */
export class AnalyticsAgent implements Agent {
  readonly name = "analytics" as const;
  constructor(private readonly ctx: AgentContext, private readonly collector: MetricsCollector) {}

  baseline(excludeId: string): Baseline {
    const rows = this.ctx.repo.db.all<{ views: number | null; likes: number | null }>(
      `SELECT views, likes FROM analytics a WHERE article_id != ? AND collected_at = (SELECT MAX(collected_at) FROM analytics b WHERE b.article_id = a.article_id)`,
      [excludeId],
    );
    const v = rows.map((r) => r.views).filter((x): x is number => x !== null);
    const l = rows.map((r) => r.likes).filter((x): x is number => x !== null);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return { avg_views: avg(v), avg_likes: avg(l), sample_size: v.length };
  }

  async handle(task: Task): Promise<AgentResult> {
    const { repo, llm } = this.ctx;
    const id = String(task.input.article_id ?? "");
    const article = repo.getArticle(id);
    const published = repo.getPublished(id);
    if (!article || !published) throw new NonRetryableError(`published article not found: ${id}`);
    const idea = repo.getIdea(article.idea_id);

    const metrics = await this.collector.collect(article, published);
    const baseline = this.baseline(id);
    const { score, engagement, conversion } = scorePerformance(metrics, article, baseline);
    let review = ruleBasedReview(metrics, article, baseline, engagement, conversion);

    if (!llm.isMock) {
      const ctx = { title: article.title, topic: idea?.topic ?? "", mode: article.mode, price: article.price, metrics, baseline, rule_based: review };
      const p = analyticsReviewPrompt(ctx);
      try {
        review = await generateJson(llm, { task: "analytics_review", system: p.system, prompt: p.prompt, context: ctx }, (v) => {
          const o = v as Record<string, unknown>;
          return { what_worked: strArr(o, "what_worked"), what_failed: strArr(o, "what_failed"), next_actions: strArr(o, "next_actions") };
        });
      } catch (e) {
        this.ctx.logger.warn(`LLM analytics review failed, using rule-based review: ${(e as Error).message}`);
      }
    }

    const result: AnalyticsResult = {
      article_id: id,
      performance_score: score,
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      sales: metrics.sales,
      engagement,
      conversion,
      ...review,
      is_simulated: metrics.source === "simulation",
    };
    repo.saveAnalytics(result, metrics);
    for (const w of result.what_worked) repo.addFeedback(id, "analytics", "worked", w);
    for (const f of result.what_failed) repo.addFeedback(id, "analytics", "failed", f);
    return { kind: "completed", output: result as unknown as Record<string, unknown> };
  }
}
