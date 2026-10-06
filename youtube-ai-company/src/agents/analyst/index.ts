import { InvalidInputError } from "../../core/errors.js";
import { newId } from "../../core/ids.js";
import type { TaskRecord } from "../../database/types.js";
import { completeJson } from "../../llm/index.js";
import type { MetricsResult, VideoMetrics } from "../../youtube/index.js";
import { BaseAgent, type ExecutionContext } from "../base-agent.js";
import { AnalysisOutputSchema } from "../schemas.js";

export interface ScoreResult {
  score: number;
  basis: string[];
  insufficientData: boolean;
}

/**
 * Performance score (0-100) from *available* metrics only. Missing metrics are excluded
 * and the remaining weights renormalized — nothing is guessed.
 */
export function computePerformanceScore(m: VideoMetrics, channelMedianViews: number | null): ScoreResult {
  const parts: { w: number; v: number; name: string }[] = [];
  if (m.views !== undefined) {
    const v = channelMedianViews && channelMedianViews > 0
      ? Math.min(100, (m.views / channelMedianViews) * 50)
      : Math.min(100, (Math.log10(Math.max(1, m.views)) / Math.log10(50_000)) * 100);
    parts.push({ w: 0.35, v, name: channelMedianViews ? "views_vs_channel_median" : "views_log_scale" });
  }
  if (m.averageViewPercentage !== undefined) parts.push({ w: 0.35, v: Math.min(100, m.averageViewPercentage), name: "avg_view_percentage" });
  if (m.views && m.likes !== undefined) {
    const engaged = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0);
    parts.push({ w: 0.2, v: Math.min(100, (engaged / m.views / 0.08) * 100), name: "engagement_rate" });
  }
  if (m.views && m.subscribersGained !== undefined) {
    parts.push({ w: 0.1, v: Math.min(100, ((m.subscribersGained / m.views) * 1000 / 2) * 100), name: "subs_per_1k_views" });
  }
  const total = parts.reduce((s, p) => s + p.w, 0);
  if (!total) return { score: 0, basis: [], insufficientData: true };
  return {
    score: Math.round(parts.reduce((s, p) => s + p.w * p.v, 0) / total),
    basis: parts.map((p) => p.name),
    insufficientData: parts.length < 2,
  };
}

/**
 * 社員4: Analytics & Growth Strategist — データ分析・成長戦略責任者.
 * Pulls real (or simulated) metrics, judges success/failure and experiments,
 * and produces concrete improvement actions for the next video.
 */
export class AnalystAgent extends BaseAgent {
  readonly name = "analyst" as const;
  readonly handles = ["analytics" as const];

  protected async execute(task: TaskRecord, { log, checkpoint }: ExecutionContext): Promise<Record<string, unknown>> {
    const { config, repos, youtube, llm, prompts, artifacts, clock } = this.ctx;
    const videoId = task.input.videoId;
    if (typeof videoId !== "string") throw new InvalidInputError("analytics requires videoId");
    const video = await repos.videos.get(videoId);
    if (!video) throw new InvalidInputError(`Video ${videoId} not found`);
    if (video.status !== "published" || !video.youtube_video_id) {
      throw new InvalidInputError(`Video ${videoId} is not published (status=${video.status})`);
    }
    const script = await repos.scripts.get(video.script_id);
    const idea = video.idea_id ? await repos.ideas.get(video.idea_id) : undefined;
    const experiment = video.experiment_id ? await repos.experiments.get(video.experiment_id) : undefined;
    const durationSec = Number(script?.content.estimated_duration_sec ?? 0) || undefined;
    const hookStyle = (script?.content.hook_style as "question" | "conclusion" | "other" | undefined) ?? "other";

    checkpoint();
    const today = clock.now().toISOString().slice(0, 10);
    const result: MetricsResult = await youtube.getVideoMetrics(video.youtube_video_id, {
      startDate: (video.published_at ?? clock.now().toISOString()).slice(0, 10),
      endDate: today,
      context: { durationSec, hookStyle, confidence: idea?.confidence_score },
    });

    const past = (await repos.analytics.list({ limit: 50 })).filter((a) => a.video_id !== videoId);
    const pastViews = past.map((a) => Number((a.metrics as VideoMetrics).views)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    const medianViews = pastViews.length ? pastViews[Math.floor(pastViews.length / 2)]! : null;
    const score = computePerformanceScore(result.metrics, medianViews);
    const channelAverageScore = past.length ? Math.round(past.reduce((s, a) => s + a.performance_score, 0) / past.length) : null;

    // Experiment verdict: compare the experiment's metric with the channel baseline when we have one.
    let experimentVerdict: "success" | "failure" | "inconclusive" | null = null;
    let metricValue: number | null = null;
    let baseline: number | null = null;
    if (experiment) {
      const key = experiment.metric as keyof VideoMetrics;
      metricValue = typeof result.metrics[key] === "number" ? (result.metrics[key] as number) : null;
      const baselineVals = past
        .filter((a) => !experiment.video_ids.includes(a.video_id))
        .map((a) => Number((a.metrics as Record<string, unknown>)[key]))
        .filter((v) => Number.isFinite(v));
      baseline = baselineVals.length ? baselineVals.reduce((s, v) => s + v, 0) / baselineVals.length : null;
      if (metricValue !== null && baseline !== null && baseline > 0) {
        experimentVerdict = metricValue >= baseline * 1.05 ? "success" : metricValue <= baseline * 0.95 ? "failure" : "inconclusive";
      }
    }

    checkpoint();
    const context = {
      title: video.title,
      topic: idea?.topic ?? null,
      hook: script?.content.hook ?? null,
      hookStyle,
      durationSec,
      metrics: result.metrics,
      unavailableMetrics: result.unavailable,
      retention: result.retention,
      performanceScore: score.score,
      scoreBasis: score.basis,
      insufficientData: score.insufficientData,
      channelAverageScore,
      pastVideoCount: past.length,
      experiment: experiment ? { name: experiment.name, hypothesis: experiment.hypothesis, variant: experiment.variant, metric: experiment.metric, metricValue, baseline } : null,
    };
    const analysis = await completeJson(
      llm,
      {
        purpose: "analysis",
        system: prompts.load("analyst"),
        prompt: `次の投稿済み動画のデータを分析し、JSONで返してください。取得できない指標は推測しないこと。\n\n${JSON.stringify(context, null, 2)}`,
        context,
      },
      AnalysisOutputSchema,
      log,
      { baseDelayMs: config.pipeline.retryBaseDelayMs },
    );
    if (experiment && experimentVerdict === null) experimentVerdict = analysis.experiment_verdict ?? "inconclusive";

    const analyticsId = newId("analytics");
    const now = clock.now().toISOString();
    const report = {
      video_id: videoId,
      youtube_video_id: video.youtube_video_id,
      performance_score: score.score,
      score_basis: score.basis,
      insufficient_data: score.insufficientData,
      success: analysis.success,
      verdict_reason: analysis.verdict_reason,
      what_worked: analysis.what_worked,
      what_failed: analysis.what_failed,
      hook_assessment: analysis.hook_assessment,
      duration_assessment: analysis.duration_assessment,
      retention_analysis: analysis.retention_analysis,
      title_assessment: analysis.title_assessment,
      theme_strength: analysis.theme_strength,
      comparison_to_past: analysis.comparison_to_past,
      recommended_changes: analysis.recommended_changes,
      next_experiments: analysis.next_experiments,
      growth_hypothesis: analysis.growth_hypothesis,
      experiment: context.experiment ? { ...context.experiment, experiment_id: experiment!.experiment_id, verdict: experimentVerdict } : null,
    };
    const filePath = artifacts.write("analytics", analyticsId, {
      analytics_id: analyticsId,
      created_at: now,
      is_mock: result.source === "mock",
      metrics: result.metrics,
      unavailable_metrics: result.unavailable,
      retention: result.retention,
      ...report,
    });
    await repos.analytics.insert({
      analytics_id: analyticsId,
      video_id: videoId,
      youtube_video_id: video.youtube_video_id,
      metrics: { ...result.metrics },
      unavailable_metrics: result.unavailable,
      performance_score: score.score,
      report,
      is_mock: result.source === "mock" ? 1 : 0,
      file_path: filePath,
    });

    // Structured feedback for upstream agents.
    const feedbackIds: string[] = [];
    const feedbackItems = [
      {
        target: "researcher" as const,
        content: {
          theme: idea?.topic ?? null,
          theme_strength: analysis.theme_strength,
          success: analysis.success,
          next_experiments: analysis.next_experiments,
          growth_hypothesis: analysis.growth_hypothesis,
        },
      },
      {
        target: "scriptwriter" as const,
        content: {
          hook_style: hookStyle,
          hook_assessment: analysis.hook_assessment,
          duration_assessment: analysis.duration_assessment,
          retention_analysis: analysis.retention_analysis,
          recommended_changes: analysis.recommended_changes,
        },
      },
    ];
    for (const item of feedbackItems) {
      const feedbackId = newId("fb");
      const fbPath = artifacts.write("feedback", feedbackId, { feedback_id: feedbackId, video_id: videoId, analytics_id: analyticsId, source_agent: "analyst", target_agent: item.target, created_at: now, ...item.content });
      await repos.feedback.insert({
        feedback_id: feedbackId,
        video_id: videoId,
        analytics_id: analyticsId,
        source_agent: "analyst",
        target_agent: item.target,
        content: item.content,
        applied: 0,
        file_path: fbPath,
      });
      feedbackIds.push(feedbackId);
    }

    log.info("analytics.done", `Score ${score.score} (${analysis.success ? "success" : "needs improvement"}) for "${video.title}"`, {
      video_id: videoId,
      unavailable: result.unavailable,
      experiment_verdict: experimentVerdict,
    });
    return {
      analytics_id: analyticsId,
      file_path: filePath,
      feedback_ids: feedbackIds,
      performance_score: score.score,
      success: analysis.success,
      experiment_id: experiment?.experiment_id ?? null,
      experiment_verdict: experimentVerdict,
      experiment_metric_value: metricValue,
      experiment_baseline: baseline,
    };
  }
}
