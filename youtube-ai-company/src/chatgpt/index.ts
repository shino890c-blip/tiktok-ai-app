import { z } from "zod";
import type { AgentContext } from "../agents/context.js";
import { ScriptOutputSchema, type ScriptOutput } from "../agents/schemas.js";
import { detectHookStyle, normalizeScript } from "../agents/scriptwriter/index.js";
import { startOfUtcDay } from "../core/clock.js";
import { InvalidInputError } from "../core/errors.js";
import { newId } from "../core/ids.js";
import type { PipelineRecord } from "../database/types.js";

/**
 * "ChatGPT copy-paste" mode: no API key. We build a request prompt, the human pastes it
 * into ChatGPT (or any chat AI), then pastes the JSON answer back. Imported scripts then
 * go through the normal Quality Check → Render → Delivery pipeline.
 * The chat UI itself is never automated (that would break the chat service's terms).
 */

export const ImportedVideoSchema = z.object({
  topic: z.string().min(2),
  hook: z.string().min(2),
  target_audience: z.string().default(""),
  why_worth_making: z.string().default(""),
  script: ScriptOutputSchema,
});
export type ImportedVideo = z.infer<typeof ImportedVideoSchema>;

const ImportSchema = z.object({ videos: z.array(ImportedVideoSchema).min(1).max(10) });

const EXAMPLE = {
  videos: [
    {
      topic: "（テーマ）",
      hook: "（冒頭0〜2秒で言う一言）",
      target_audience: "（想定視聴者）",
      why_worth_making: "（この企画を作る価値）",
      script: {
        title_candidates: ["タイトル案1", "タイトル案2", "タイトル案3"],
        hook: { time_range: "0-2s", narration: "（冒頭のセリフ）", telop: "（冒頭テロップ）", visual: "（冒頭の映像イメージ）", intent: "（狙い）" },
        scenes: [
          { scene_no: 1, start_sec: 0, end_sec: 3, narration: "（セリフ）", telop: "（画面の文字）", visual: "（映像イメージ）", sfx: "（効果音）", bgm: "（BGM）" },
          { scene_no: 2, start_sec: 3, end_sec: 10, narration: "…", telop: "…", visual: "…", sfx: "", bgm: "" },
        ],
        cta: "（最後の呼びかけ）",
        estimated_duration_sec: 25,
        retention_points: [{ time_sec: 2, technique: "（続きを見たくなる仕掛け）" }],
        description: "（説明文）",
        hashtags: ["#Shorts", "#…"],
        bgm_direction: "（BGMの雰囲気）",
        fact_check_notes: ["（投稿前に確認すべき事実）"],
      },
    },
  ],
};

export interface PromptOptions {
  count?: number;
  /** Build a fix request for a pipeline whose imported script failed QC. */
  fixPipelineId?: string;
}

export async function remainingToday(ctx: AgentContext): Promise<number> {
  const since = startOfUtcDay(ctx.clock.now()).toISOString();
  const created = await ctx.repos.pipelines.count({}, "created_at >= ? AND status != 'CANCELLED'", [since]);
  return Math.max(0, ctx.config.pipeline.dailyVideoLimit - created);
}

function rules(ctx: AgentContext): string[] {
  const p = ctx.config.pipeline;
  return [
    `・ジャンル: ${ctx.config.channel.niche}（日本語）`,
    `・1本 ${p.shortsMinDurationSec}〜${p.shortsMaxDurationSec}秒（おすすめ20〜35秒）の縦型ショート動画`,
    "・冒頭0〜2秒で「え、何それ？」「続きが気になる」と思わせる。ただし嘘・誇張・過度な煽り（絶対・100%・衝撃など）は禁止",
    "・他人の動画のコピーは禁止。完全オリジナルの内容にする",
    "・健康・お金の話は断定しない。説明文に「一般的な情報です」などの注意書きを入れる",
    "・scenes は 0秒から隙間なく続ける（前のシーンの end_sec = 次の start_sec）。最後の end_sec = estimated_duration_sec",
    "・ナレーションは1秒あたり12文字以内（読み上げが字幕とズレないように）",
    "・telop（画面の大きな文字）は1シーン16文字以内",
    "・title_candidates はちょうど3つ。hashtags に #Shorts を含める",
    "・映像は「文字と背景色だけ」で作るので、visual は雰囲気のメモ程度でよい",
  ];
}

/** The prompt the human pastes into ChatGPT. Includes what the team has learned so far. */
export async function buildChatGPTPrompt(ctx: AgentContext, opts: PromptOptions = {}): Promise<string> {
  if (opts.fixPipelineId) return buildFixPrompt(ctx, opts.fixPipelineId);
  const count = Math.max(1, Math.min(5, opts.count ?? ((await remainingToday(ctx)) || 1)));
  const digest = await ctx.knowledge.digest(5);
  const used = (await ctx.repos.ideas.list({ where: { status: ["selected", "used"] }, limit: 20 })).map((i) => i.topic);
  const experiment = await ctx.experiments.pickNext();

  const learned = [
    ...digest.goodHooks.map((x) => `・良かった冒頭: ${x}`),
    ...digest.badHooks.map((x) => `・悪かった冒頭: ${x}`),
    ...digest.goodThemes.map((x) => `・伸びたテーマ: ${x}`),
    ...digest.badThemes.map((x) => `・伸びなかったテーマ（避ける）: ${x}`),
    ...digest.positive.map((x) => `・成功要因: ${x}`),
    ...digest.negative.map((x) => `・失敗要因: ${x}`),
  ];
  return [
    `あなたはYouTubeショート動画の企画・脚本のプロです。次の条件で、オリジナルのショート動画の台本を${count}本作ってください。`,
    "",
    "【条件】",
    ...rules(ctx),
    ...(experiment ? [`・今回の検証テーマ: ${experiment.variant}（${experiment.hypothesis}）→ 1本目はこの条件で作る`] : []),
    ...(used.length ? ["", "【すでに作ったテーマ（重複しない）】", ...used.map((t) => `・${t}`)] : []),
    ...(learned.length ? ["", "【これまでの実績から分かったこと（参考にする）】", ...learned] : []),
    "",
    "【出力形式】",
    "説明や前置きは書かず、次の形のJSONだけを ```json のコードブロックで出力してください。",
    "```json",
    JSON.stringify(EXAMPLE, null, 2),
    "```",
  ].join("\n");
}

async function buildFixPrompt(ctx: AgentContext, pipelineId: string): Promise<string> {
  const p = await ctx.repos.pipelines.get(pipelineId);
  if (!p?.script_id) throw new InvalidInputError(`Pipeline ${pipelineId} has no script to fix`);
  const script = await ctx.repos.scripts.get(p.script_id);
  const idea = p.idea_id ? await ctx.repos.ideas.get(p.idea_id) : undefined;
  const issues = ((script?.qc_report?.issues as { severity: string; field: string; message: string; suggestion?: string }[]) ?? []).filter(
    (i) => i.severity !== "minor",
  );
  const { qc_report: _qc, ...content } = (script?.content ?? {}) as Record<string, unknown>;
  void _qc;
  return [
    "次のYouTubeショート動画の台本を、品質チェックの指摘に従って修正してください。内容の良さは保ったまま、指摘箇所だけ直してください。",
    "",
    "【品質チェックの指摘】",
    ...issues.map((i) => `・${i.field}: ${i.message}${i.suggestion ? `（${i.suggestion}）` : ""}`),
    "",
    "【守るルール】",
    ...rules(ctx),
    "",
    "【元の台本】",
    "```json",
    JSON.stringify({ videos: [{ topic: idea?.topic, hook: idea?.hook, target_audience: idea?.target_audience, why_worth_making: idea?.why_worth_making, script: content }] }, null, 2),
    "```",
    "",
    "修正後の台本を、上と同じ形のJSONだけで ```json のコードブロックに出力してください。",
  ].join("\n");
}

/** Accepts the raw ChatGPT answer (with or without code fences / prose) and validates it. */
export function parseChatGPTAnswer(text: string): ImportedVideo[] {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]!);
  const candidates = fenced.length ? fenced : [text];
  let lastError = "JSONが見つかりませんでした。ChatGPTの回答の ```json から ``` までを丸ごとコピーしてください。";
  for (const c of candidates) {
    const start = c.search(/[[{]/);
    const end = Math.max(c.lastIndexOf("}"), c.lastIndexOf("]"));
    if (start === -1 || end <= start) continue;
    let data: unknown;
    try {
      data = JSON.parse(c.slice(start, end + 1));
    } catch (err) {
      lastError = `JSONの形が壊れています（途中で切れていませんか？）: ${(err as Error).message}`;
      continue;
    }
    if (Array.isArray(data)) data = { videos: data };
    else if (data && typeof data === "object" && !("videos" in data)) data = { videos: [data] };
    const parsed = ImportSchema.safeParse(data);
    if (parsed.success) return parsed.data.videos;
    lastError = `形式が足りません: ${parsed.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".")} ${i.message}`)
      .join(" / ")}。依頼文をもう一度ChatGPTに送ってください。`;
  }
  throw new InvalidInputError(lastError);
}

export interface ImportResult {
  imported: { pipeline_id: string; topic: string; title: string }[];
  skipped: { topic: string; reason: string }[];
}

/**
 * Stores each pasted script as idea + script and starts a pipeline at Quality Check.
 * DAILY_VIDEO_LIMIT still applies; extra scripts are reported as skipped.
 */
export async function importChatGPTAnswer(ctx: AgentContext, text: string): Promise<ImportResult> {
  const videos = parseChatGPTAnswer(text);
  const { repos, artifacts, clock, tasks, experiments, logger } = ctx;
  const log = logger.child({ agent: "supervisor" });
  const result: ImportResult = { imported: [], skipped: [] };
  let remaining = await remainingToday(ctx);

  for (const v of videos) {
    if (remaining <= 0) {
      result.skipped.push({ topic: v.topic, reason: `今日の上限（${ctx.config.pipeline.dailyVideoLimit}本）に達しました。明日もう一度取り込んでください` });
      continue;
    }
    const script: ScriptOutput = normalizeScript(v.script);
    const now = clock.now().toISOString();
    const pipelineId = newId("pipe");
    const researchId = newId("research");
    const ideaId = newId("idea");
    const scriptId = newId("script");
    const experiment = await experiments.pickNext();
    const hookStyle = detectHookStyle(script.hook.narration, experiment?.variant);

    const researchFile = artifacts.write("research", researchId, {
      research_id: researchId,
      pipeline_id: pipelineId,
      source: "chatgpt",
      created_at: now,
      market_summary: "ChatGPTで作成した企画（コピペ取り込み）",
      ideas: [{ idea_id: ideaId, topic: v.topic, hook: v.hook, target_audience: v.target_audience, why_worth_making: v.why_worth_making }],
    });
    await repos.pipelines.insert({
      pipeline_id: pipelineId,
      goal: `ChatGPT台本: ${v.topic}`,
      source: "chatgpt",
      status: "ACTIVE",
      stage: "QUALITY_CHECK",
      research_id: researchId,
      idea_id: ideaId,
      script_id: scriptId,
      video_id: null,
      analytics_id: null,
      experiment_id: experiment?.experiment_id ?? null,
      revision_count: 0,
      error: null,
    });
    await repos.research.insert({
      research_id: researchId,
      pipeline_id: pipelineId,
      task_id: null,
      query: "chatgpt",
      market_summary: "ChatGPTで作成した企画（コピペ取り込み）",
      findings: { source: "chatgpt" },
      source_urls: [],
      is_mock: 0,
      file_path: researchFile,
    });
    await repos.ideas.insert({
      idea_id: ideaId,
      research_id: researchId,
      pipeline_id: pipelineId,
      topic: v.topic,
      hook: v.hook,
      trend_reason: "ChatGPTによる企画",
      why_worth_making: v.why_worth_making || "（未記入）",
      target_audience: v.target_audience || "（未記入）",
      recommended_duration: Math.round(script.estimated_duration_sec),
      structure: ["hook", "problem", "development", "payoff", "cta"],
      confidence_score: 0.7,
      source_urls: [],
      experiment_id: experiment?.experiment_id ?? null,
      status: "selected",
    });
    const scriptFile = artifacts.write("scripts", scriptId, { script_id: scriptId, idea_id: ideaId, pipeline_id: pipelineId, source: "chatgpt", version: 1, hook_style: hookStyle, created_at: now, ...script });
    await repos.scripts.insert({
      script_id: scriptId,
      idea_id: ideaId,
      pipeline_id: pipelineId,
      task_id: null,
      version: 1,
      content: { ...script, hook_style: hookStyle } as unknown as Record<string, unknown>,
      status: "draft",
      qc_report: null,
      file_path: scriptFile,
    });
    await tasks.create("quality_check", { pipelineId, scriptId }, { pipelineId });
    log.info("chatgpt.imported", `Imported ChatGPT script "${v.topic}"`, { pipeline_id: pipelineId });
    result.imported.push({ pipeline_id: pipelineId, topic: v.topic, title: script.title_candidates[0]! });
    remaining--;
  }
  return result;
}

/** ChatGPT-sourced pipelines that failed QC and can be fixed with a fix prompt. */
export async function fixablePipelines(ctx: AgentContext): Promise<PipelineRecord[]> {
  return ctx.repos.pipelines.list({ where: { source: "chatgpt", status: "FAILED" }, limit: 10 });
}
