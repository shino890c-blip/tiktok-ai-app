import { InvalidInputError, ValidationError } from "../../core/errors.js";
import { newId } from "../../core/ids.js";
import type { TaskRecord } from "../../database/types.js";
import { completeJson } from "../../llm/index.js";
import type { TrendingVideo } from "../../youtube/index.js";
import { BaseAgent, type ExecutionContext } from "../base-agent.js";
import { ResearchOutputSchema, type ResearchIdea } from "../schemas.js";
import { similarity } from "../text-utils.js";

/** Ideas this similar (bigram Jaccard) to an existing video title are treated as copies and dropped. */
const COPY_SIMILARITY_THRESHOLD = 0.6;

/**
 * 社員1: YouTube Researcher — 市場調査のプロ.
 * Collects trend signals, abstracts *why* things work, and proposes original ideas
 * with an explicit "why this is worth making" judgement. Never copies other videos.
 */
export class ResearcherAgent extends BaseAgent {
  readonly name = "researcher" as const;
  readonly handles = ["research" as const];

  protected async execute(task: TaskRecord, { log, checkpoint }: ExecutionContext): Promise<Record<string, unknown>> {
    const { config, youtube, repos, knowledge, experiments, artifacts, prompts, llm, clock } = this.ctx;
    const pipelineId = (task.input.pipelineId as string | undefined) ?? task.pipeline_id;
    if (!pipelineId) throw new InvalidInputError("research task requires pipelineId");
    const goal = String(task.input.goal ?? "新しい動画を作る");

    // 1. Market signals
    const publishedAfter = new Date(clock.now().getTime() - 7 * 24 * 3_600_000);
    const collected = new Map<string, TrendingVideo>();
    for (const kw of config.channel.searchKeywords.slice(0, 3)) {
      checkpoint();
      const found = await youtube.searchTrendingShorts(kw, { regionCode: config.channel.regionCode, maxResults: 10, publishedAfter });
      for (const v of found) collected.set(v.videoId, v);
    }
    const trending = [...collected.values()].sort((a, b) => b.viewsPerHour - a.viewsPerHour).slice(0, 8);
    log.info("research.trending_collected", `Collected ${trending.length} trending shorts`, { keywords: config.channel.searchKeywords });

    const comments: Record<string, string[]> = {};
    for (const v of trending.slice(0, 3)) {
      checkpoint();
      comments[v.videoId] = await youtube.getTopComments(v.videoId, 5);
    }

    const stats = {
      sample_size: trending.length,
      avg_duration_sec: trending.length ? Math.round(trending.reduce((s, v) => s + v.durationSec, 0) / trending.length) : null,
      median_views_per_hour: trending.length ? trending[Math.floor(trending.length / 2)]!.viewsPerHour : null,
      title_patterns: {
        question: trending.filter((v) => /[?？]/.test(v.title)).length,
        number: trending.filter((v) => /\d/.test(v.title)).length,
        bracket: trending.filter((v) => /[【「]/.test(v.title)).length,
      },
    };

    // 2. Our own history + team knowledge
    const history = await repos.db.all<{ title: string; performance_score: number }>(
      `SELECT v.title AS title, a.performance_score AS performance_score
         FROM analytics a JOIN videos v ON v.video_id = a.video_id
        ORDER BY a.performance_score DESC`,
    );
    const ownHistory = {
      best: history.slice(0, 3),
      worst: history.length > 3 ? history.slice(-3) : [],
    };
    const digest = await knowledge.digest();
    const recentTopics = (await repos.ideas.list({ where: { status: ["selected", "used"] }, limit: 10 })).map((i) => i.topic);
    const experiment = await experiments.pickNext();

    // 3. Ask the LLM to abstract patterns into original ideas
    checkpoint();
    const context = {
      niche: config.channel.niche,
      language: config.channel.language,
      goal,
      seed: pipelineId,
      trending: trending.map((v) => ({ ...v, topComments: comments[v.videoId] ?? [] })),
      stats,
      ownHistory,
      knowledge: digest,
      negativeThemes: digest.badThemes,
      recentTopics,
      experiment: experiment ? { name: experiment.name, hypothesis: experiment.hypothesis, variant: experiment.variant } : null,
    };
    const output = await completeJson(
      llm,
      {
        purpose: "research",
        system: prompts.load("researcher", { niche: config.channel.niche, language: config.channel.language }),
        prompt: `以下の市場データを分析し、指定スキーマのJSONで企画案を出してください。\n\n${JSON.stringify(context, null, 2)}`,
        context,
      },
      ResearchOutputSchema,
      log,
      { baseDelayMs: config.pipeline.retryBaseDelayMs },
    );

    // 4. Guardrails: originality + learned negatives
    const titles = trending.map((v) => v.title);
    const accepted: ResearchIdea[] = [];
    const rejected: { topic: string; reason: string }[] = [];
    for (const idea of output.ideas) {
      const copied = titles.find((t) => similarity(t, idea.topic) >= COPY_SIMILARITY_THRESHOLD || similarity(t, idea.hook) >= COPY_SIMILARITY_THRESHOLD);
      if (copied) {
        rejected.push({ topic: idea.topic, reason: `既存動画「${copied}」と酷似（コピー禁止）` });
        continue;
      }
      if (digest.badThemes.some((b) => similarity(b, idea.topic) >= 0.7)) {
        rejected.push({ topic: idea.topic, reason: "過去に伸びなかったテーマ" });
        continue;
      }
      accepted.push(idea);
    }
    if (!accepted.length) {
      throw new ValidationError("All proposed ideas were rejected by originality/knowledge checks", { rejected });
    }

    // 5. Idea selection (confidence, penalize repeats)
    const scored = accepted
      .map((idea) => ({
        idea,
        score: idea.confidence_score - (recentTopics.some((t) => similarity(t, idea.topic) >= 0.7) ? 0.15 : 0),
      }))
      .sort((a, b) => b.score - a.score);

    // 6. Persist: file first, then rows (Supervisor verifies both)
    const researchId = newId("research");
    const now = clock.now().toISOString();
    const ideaRows = scored.map(({ idea }, i) => ({
      idea_id: newId("idea"),
      topic: idea.topic,
      hook: idea.hook,
      trend_reason: idea.trend_reason,
      why_worth_making: idea.why_worth_making,
      target_audience: idea.target_audience,
      recommended_duration: idea.recommended_duration,
      structure: idea.structure,
      confidence_score: idea.confidence_score,
      source_urls: idea.source_urls,
      originality_note: idea.originality_note,
      selected: i === 0,
      created_at: now,
    }));
    const sourceUrls = trending.map((v) => v.url);
    const filePath = artifacts.write("research", researchId, {
      research_id: researchId,
      pipeline_id: pipelineId,
      task_id: task.task_id,
      is_mock: youtube.isMock,
      created_at: now,
      market_summary: output.market_summary,
      audience_pains: output.audience_pains,
      trend_patterns: output.trend_patterns,
      stats,
      own_history: ownHistory,
      experiment: context.experiment,
      rejected_ideas: rejected,
      ideas: ideaRows,
      source_urls: sourceUrls,
    });

    await repos.research.insert({
      research_id: researchId,
      pipeline_id: pipelineId,
      task_id: task.task_id,
      query: config.channel.searchKeywords.join(","),
      market_summary: output.market_summary,
      findings: { audience_pains: output.audience_pains, trend_patterns: output.trend_patterns, stats, rejected },
      source_urls: sourceUrls,
      is_mock: youtube.isMock ? 1 : 0,
      file_path: filePath,
    });
    for (const row of ideaRows) {
      await repos.ideas.insert({
        idea_id: row.idea_id,
        research_id: researchId,
        pipeline_id: pipelineId,
        topic: row.topic,
        hook: row.hook,
        trend_reason: row.trend_reason,
        why_worth_making: row.why_worth_making,
        target_audience: row.target_audience,
        recommended_duration: row.recommended_duration,
        structure: row.structure,
        confidence_score: row.confidence_score,
        source_urls: row.source_urls,
        experiment_id: row.selected ? (experiment?.experiment_id ?? null) : null,
        status: row.selected ? "selected" : "candidate",
      });
    }
    const selected = ideaRows[0]!;
    log.info("research.idea_selected", `Selected idea: ${selected.topic}`, {
      idea_id: selected.idea_id,
      confidence: selected.confidence_score,
      experiment: experiment?.name,
      rejected: rejected.length,
    });
    return {
      research_id: researchId,
      file_path: filePath,
      idea_ids: ideaRows.map((r) => r.idea_id),
      selected_idea_id: selected.idea_id,
      experiment_id: experiment?.experiment_id ?? null,
    };
  }
}
