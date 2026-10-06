import { InvalidInputError } from "../../core/errors.js";
import type { KnowledgeCategory, KnowledgeRecord, TaskRecord } from "../../database/types.js";
import type { KnowledgeInput } from "../../knowledge/index.js";
import { BaseAgent, type ExecutionContext } from "../base-agent.js";

/**
 * 社員5: Supervisor / Orchestrator — AI会社のオペレーション責任者.
 * As a worker agent it owns the "feedback" step: it turns the Analyst's report into
 * Knowledge Base entries and experiment conclusions (learning loop). Orchestration
 * (workflow, integrity checks, recovery) lives in orchestrator.ts.
 */
export class SupervisorAgent extends BaseAgent {
  readonly name = "supervisor" as const;
  readonly handles = ["feedback" as const];

  protected async execute(task: TaskRecord, { log }: ExecutionContext): Promise<Record<string, unknown>> {
    const { repos, knowledge, experiments } = this.ctx;
    const analyticsId = task.input.analyticsId;
    if (typeof analyticsId !== "string") throw new InvalidInputError("feedback requires analyticsId");
    const analytics = await repos.analytics.get(analyticsId);
    if (!analytics) throw new InvalidInputError(`Analytics ${analyticsId} not found`);
    const video = await repos.videos.get(analytics.video_id);
    if (!video) throw new InvalidInputError(`Video ${analytics.video_id} not found`);
    const feedback = await repos.feedback.list({ where: { analytics_id: analyticsId } });
    if (!feedback.length) throw new InvalidInputError(`No feedback rows for analytics ${analyticsId}`);

    // Idempotent: if this analytics report was already learned from, don't duplicate entries.
    const existing = (await knowledge.forVideo(video.video_id)).filter((k) => k.evidence.analytics_id === analyticsId);
    if (existing.length) {
      log.info("feedback.already_applied", "Knowledge already recorded for this analytics report", { analytics_id: analyticsId });
      await this.markApplied(feedback.map((f) => f.feedback_id));
      return { knowledge_ids: existing.map((k) => k.knowledge_id), feedback_ids: feedback.map((f) => f.feedback_id), experiment_conclusion: null };
    }

    const r = analytics.report as Record<string, any>;
    const script = await repos.scripts.get(video.script_id);
    const idea = video.idea_id ? await repos.ideas.get(video.idea_id) : undefined;
    const success = Boolean(r.success);
    const pol: KnowledgeRecord["polarity"] = success ? "positive" : "negative";
    const evidence = { analytics_id: analyticsId, performance_score: analytics.performance_score, metrics: analytics.metrics };
    const base = { videoId: video.video_id, experimentId: video.experiment_id, score: analytics.performance_score, evidence };
    const entries: KnowledgeInput[] = [
      { ...base, category: "video_outcome", polarity: pol, content: `「${video.title}」スコア${analytics.performance_score}: ${String(r.verdict_reason ?? "")}` },
      { ...base, category: "title_pattern", polarity: pol, content: video.title },
    ];
    const hook = script?.content.hook as { narration?: string } | undefined;
    if (hook?.narration) {
      entries.push({ ...base, category: "hook", polarity: pol, content: `[${String(script?.content.hook_style ?? "other")}] ${hook.narration}` });
    }
    if (idea) {
      const themePol = r.theme_strength === "strong" ? "positive" : r.theme_strength === "weak" ? "negative" : pol;
      entries.push({ ...base, category: "theme", polarity: themePol, content: idea.topic });
    }
    if (script?.content.estimated_duration_sec) {
      entries.push({ ...base, category: "duration", polarity: pol, content: `${String(script.content.estimated_duration_sec)}秒: ${String(r.duration_assessment ?? "")}` });
    }
    if (script?.content.cta) entries.push({ ...base, category: "cta", polarity: pol, content: String(script.content.cta) });
    for (const line of (r.retention_analysis as string[]) ?? []) entries.push({ ...base, category: "retention", polarity: "neutral", content: line });
    for (const w of (r.what_worked as string[]) ?? []) entries.push({ ...base, category: "success_factor", polarity: "positive", content: w });
    for (const f of (r.what_failed as string[]) ?? []) entries.push({ ...base, category: "failure_factor", polarity: "negative", content: f });

    let experimentConclusion: string | null = null;
    const exp = r.experiment as { experiment_id?: string; verdict?: "success" | "failure" | "inconclusive"; metricValue?: number | null; baseline?: number | null } | null;
    if (exp?.experiment_id && exp.verdict) {
      const updated = await experiments.recordResult(exp.experiment_id, video.video_id, exp.verdict, exp.metricValue ?? null, exp.baseline ?? null);
      if (updated) {
        experimentConclusion = updated.conclusion;
        const category: KnowledgeCategory = "experiment_result";
        entries.push({
          ...base,
          category,
          polarity: exp.verdict === "success" ? "positive" : exp.verdict === "failure" ? "negative" : "neutral",
          content: `${updated.name}（${updated.variant}）: ${exp.verdict}${updated.conclusion ? ` → 結論: ${updated.conclusion}` : ""}`,
          experimentId: updated.experiment_id,
        });
      }
    }

    const ids: string[] = [];
    for (const e of entries) ids.push((await knowledge.record(e)).knowledge_id);
    await this.markApplied(feedback.map((f) => f.feedback_id));
    const snapshot = await knowledge.exportSnapshot();
    log.info("feedback.applied", `Recorded ${ids.length} knowledge entries from "${video.title}"`, {
      analytics_id: analyticsId,
      experiment_conclusion: experimentConclusion,
    });
    return { knowledge_ids: ids, feedback_ids: feedback.map((f) => f.feedback_id), experiment_conclusion: experimentConclusion, snapshot };
  }

  private async markApplied(ids: string[]): Promise<void> {
    for (const id of ids) await this.ctx.repos.feedback.update(id, { applied: 1 });
  }
}
