import { InvalidInputError } from "../../core/errors.js";
import { newId } from "../../core/ids.js";
import type { TaskRecord } from "../../database/types.js";
import { completeJson } from "../../llm/index.js";
import { BaseAgent, type ExecutionContext } from "../base-agent.js";
import { ScriptOutputSchema, type ScriptOutput } from "../schemas.js";

export type HookStyle = "question" | "conclusion" | "other";

export function detectHookStyle(hook: string, experimentVariant?: string | null): HookStyle {
  if (experimentVariant?.startsWith("hook:question")) return "question";
  if (experimentVariant?.startsWith("hook:conclusion")) return "conclusion";
  if (/[?？]/.test(hook)) return "question";
  if (/(正解|結論|です。|だけ)/.test(hook)) return "conclusion";
  return "other";
}

/**
 * 社員2: Script Writer — 視聴維持率を意識した脚本家.
 * Turns a selected idea into a fully original Shorts script (titles x3, 0–2s hook,
 * narration, telop, scenes, visual/SFX/BGM directions, CTA, retention points).
 */
export class ScriptWriterAgent extends BaseAgent {
  readonly name = "scriptwriter" as const;
  readonly handles = ["script" as const];

  protected async execute(task: TaskRecord, { log, checkpoint }: ExecutionContext): Promise<Record<string, unknown>> {
    const { config, repos, knowledge, artifacts, prompts, llm, clock } = this.ctx;

    // Input validation first: a bad input must not be retried blindly.
    const ideaId = task.input.ideaId;
    if (typeof ideaId !== "string" || !ideaId) throw new InvalidInputError("script task requires ideaId");
    const idea = await repos.ideas.get(ideaId);
    if (!idea) throw new InvalidInputError(`Idea ${ideaId} does not exist`);
    if (!idea.hook || !idea.topic) throw new InvalidInputError(`Idea ${ideaId} is missing topic/hook`);

    const experiment = idea.experiment_id ? await repos.experiments.get(idea.experiment_id) : undefined;
    const revisionNotes = Array.isArray(task.input.revisionNotes) ? (task.input.revisionNotes as string[]) : [];
    const previous =
      typeof task.input.previousScriptId === "string" ? await repos.scripts.get(task.input.previousScriptId) : undefined;
    const digest = await knowledge.digest();

    checkpoint();
    const context = {
      idea: {
        topic: idea.topic,
        hook: idea.hook,
        trend_reason: idea.trend_reason,
        why_worth_making: idea.why_worth_making,
        target_audience: idea.target_audience,
        recommended_duration: idea.recommended_duration,
        structure: idea.structure,
      },
      experiment: experiment ? { name: experiment.name, variant: experiment.variant, hypothesis: experiment.hypothesis } : null,
      knowledge: { goodHooks: digest.goodHooks, badHooks: digest.badHooks, successFactors: digest.positive, failureFactors: digest.negative },
      revisionNotes,
      previousScript: previous?.content ?? null,
      maxDuration: config.pipeline.shortsMaxDurationSec,
      minDuration: config.pipeline.shortsMinDurationSec,
      language: config.channel.language,
    };
    const script: ScriptOutput = await completeJson(
      llm,
      {
        purpose: "script",
        system: prompts.load("scriptwriter", {
          max_duration: config.pipeline.shortsMaxDurationSec,
          language: config.channel.language,
        }),
        prompt: `次の企画から完全オリジナルのYouTube Shorts台本をJSONで作成してください。${
          revisionNotes.length ? "\n品質チェックからの差し戻し事項をすべて修正すること。" : ""
        }\n\n${JSON.stringify(context, null, 2)}`,
        context,
      },
      ScriptOutputSchema,
      log,
      { baseDelayMs: config.pipeline.retryBaseDelayMs },
    );

    // Light normalization only — real problems are left for Quality Control to catch.
    script.scenes.sort((a, b) => a.start_sec - b.start_sec);
    const lastEnd = Math.max(...script.scenes.map((s) => s.end_sec));
    if (Math.abs(lastEnd - script.estimated_duration_sec) > 0.5) script.estimated_duration_sec = lastEnd;
    script.hashtags = script.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`));

    const version = (await repos.scripts.count({ idea_id: idea.idea_id })) + 1;
    const scriptId = newId("script");
    const hookStyle = detectHookStyle(script.hook.narration, experiment?.variant);
    const filePath = artifacts.write("scripts", scriptId, {
      script_id: scriptId,
      idea_id: idea.idea_id,
      pipeline_id: task.pipeline_id,
      version,
      hook_style: hookStyle,
      experiment: context.experiment,
      revision_notes: revisionNotes,
      created_at: clock.now().toISOString(),
      ...script,
    });
    await repos.scripts.insert({
      script_id: scriptId,
      idea_id: idea.idea_id,
      pipeline_id: task.pipeline_id,
      task_id: task.task_id,
      version,
      content: { ...script, hook_style: hookStyle } as unknown as Record<string, unknown>,
      status: "draft",
      qc_report: null,
      file_path: filePath,
    });
    log.info("script.written", `Script v${version} for "${idea.topic}" (${script.estimated_duration_sec}s, hook=${hookStyle})`, {
      script_id: scriptId,
    });
    return { script_id: scriptId, file_path: filePath, version, hook_style: hookStyle };
  }
}
