import { startOfUtcDay } from "../../core/clock.js";
import { InvalidInputError, NonRetryableError, PublishUnknownStateError, isRetryable } from "../../core/errors.js";
import { newId } from "../../core/ids.js";
import type { TaskRecord, VideoRecord } from "../../database/types.js";
import { completeJson } from "../../llm/index.js";
import { BaseAgent, type ExecutionContext } from "../base-agent.js";
import { QCReviewSchema, ScriptOutputSchema, type QCIssue } from "../schemas.js";
import { humanChecklist, isValidTitle, runQualityRules } from "./quality-rules.js";

/** QC passes only with zero blockers, at most this many majors, and an LLM score >= MIN_REVIEW_SCORE. */
const MAX_MAJOR_ISSUES = 3;
const MIN_REVIEW_SCORE = 60;

/**
 * 社員3: Publisher / Quality Controller — 品質管理責任者.
 * A) quality_check: rule checks + LLM review -> READY_FOR_APPROVAL or send back to Script Writer.
 * B) publish: uploads only approved videos; aborts on any unknown state.
 */
export class PublisherAgent extends BaseAgent {
  readonly name = "publisher" as const;
  readonly handles = ["quality_check" as const, "publish" as const];

  protected async execute(task: TaskRecord, exec: ExecutionContext): Promise<Record<string, unknown>> {
    if (task.type === "quality_check") return this.qualityCheck(task, exec);
    if (task.type === "publish") return this.publish(task, exec);
    throw new InvalidInputError(`Publisher cannot handle task type ${task.type}`);
  }

  private async qualityCheck(task: TaskRecord, { log, checkpoint }: ExecutionContext): Promise<Record<string, unknown>> {
    const { config, repos, llm, prompts, approvals, youtube } = this.ctx;
    const scriptId = task.input.scriptId;
    if (typeof scriptId !== "string") throw new InvalidInputError("quality_check requires scriptId");
    const scriptRow = await repos.scripts.get(scriptId);
    if (!scriptRow) throw new InvalidInputError(`Script ${scriptId} not found`);
    const parsed = ScriptOutputSchema.safeParse(scriptRow.content);
    if (!parsed.success) throw new InvalidInputError(`Script ${scriptId} content is malformed: ${parsed.error.message.slice(0, 300)}`);
    const script = parsed.data;
    const idea = await repos.ideas.get(scriptRow.idea_id);
    const experiment = idea?.experiment_id ? await repos.experiments.get(idea.experiment_id) : undefined;

    const ruleIssues = runQualityRules(script, {
      minDurationSec: config.pipeline.shortsMinDurationSec,
      maxDurationSec: config.pipeline.shortsMaxDurationSec,
      experimentVariant: experiment?.variant,
      privacyStatus: config.youtube.defaultPrivacy,
      allowPublic: config.youtube.allowPublic,
    });

    checkpoint();
    const context = { script, title: script.title_candidates[0], ruleIssues };
    const review = await completeJson(
      llm,
      {
        purpose: "quality_review",
        system: prompts.load("publisher"),
        prompt: `次のShorts台本を品質・安全性の観点でレビューし、JSONで返してください。\n\n${JSON.stringify(context, null, 2)}`,
        context,
      },
      QCReviewSchema,
      log,
      { baseDelayMs: config.pipeline.retryBaseDelayMs },
    );

    const issues: QCIssue[] = [...ruleIssues, ...review.issues.map((i) => ({ ...i, field: `llm:${i.field}` }))];
    const blockers = issues.filter((i) => i.severity === "blocker");
    const majors = issues.filter((i) => i.severity === "major");
    const passed = blockers.length === 0 && majors.length <= MAX_MAJOR_ISSUES && review.overall_score >= MIN_REVIEW_SCORE;
    const report = {
      passed,
      overall_score: review.overall_score,
      summary: review.summary,
      issues,
      counts: { blocker: blockers.length, major: majors.length, minor: issues.length - blockers.length - majors.length },
      human_checklist: humanChecklist(script, false),
    };
    await repos.scripts.update(scriptId, { status: passed ? "qc_passed" : "qc_failed", qc_report: report });

    if (!passed) {
      const revisionNotes = [...blockers, ...majors].map((i) => `[${i.severity}] ${i.field}: ${i.message}${i.suggestion ? `（${i.suggestion}）` : ""}`);
      if (review.overall_score < MIN_REVIEW_SCORE) revisionNotes.push(`[review] 総合スコア${review.overall_score}が基準${MIN_REVIEW_SCORE}未満: ${review.summary}`);
      log.warn("qc.failed", `QC failed: ${blockers.length} blocker(s), ${majors.length} major(s) — sending back to Script Writer`, {
        script_id: scriptId,
      });
      return { passed: false, script_id: scriptId, revision_notes: revisionNotes, qc_report: report };
    }

    const title = script.title_candidates.find(isValidTitle)!;
    const privacy = config.youtube.defaultPrivacy === "public" && !config.youtube.allowPublic ? "private" : config.youtube.defaultPrivacy;
    const videoId = newId("video");
    await repos.videos.insert({
      video_id: videoId,
      pipeline_id: task.pipeline_id,
      script_id: scriptId,
      idea_id: scriptRow.idea_id,
      experiment_id: idea?.experiment_id ?? null,
      title,
      description: `${script.description}\n\n${script.hashtags.join(" ")}`,
      tags: script.hashtags.map((h) => h.replace(/^#/, "")).slice(0, 15),
      privacy_status: privacy,
      video_file_path: null,
      youtube_video_id: null,
      youtube_url: null,
      status: "ready_for_approval",
      is_mock: youtube.isMock ? 1 : 0,
      published_at: null,
    });
    const approval = await approvals.request(videoId, task.pipeline_id, title);
    log.info("qc.ready_for_approval", `READY_FOR_APPROVAL: "${title}" (score ${review.overall_score})`, {
      video_id: videoId,
      approval_id: approval.approval_id,
      minor_issues: report.counts.minor,
    });
    return { passed: true, script_id: scriptId, video_id: videoId, approval_id: approval.approval_id, status: "READY_FOR_APPROVAL", qc_report: report };
  }

  private async publish(task: TaskRecord, { log, checkpoint }: ExecutionContext): Promise<Record<string, unknown>> {
    const { config, repos, youtube, clock, experiments } = this.ctx;
    const videoId = task.input.videoId;
    if (typeof videoId !== "string") throw new InvalidInputError("publish requires videoId");
    const video = await repos.videos.get(videoId);
    if (!video) throw new InvalidInputError(`Video ${videoId} not found`);

    // Idempotency: never upload twice.
    if (video.status === "published" && video.youtube_video_id) {
      log.warn("publish.already_published", "Video already published; skipping upload", { youtube_video_id: video.youtube_video_id });
      return this.publishedOutput(video);
    }
    if (video.status === "publish_unknown") {
      throw new NonRetryableError("Previous upload ended in an unknown state. A human must verify YouTube Studio first.", "PUBLISH_UNKNOWN_STATE");
    }

    // Human approval gate (AUTO_PUBLISH approvals are recorded as decided_by=system:auto_publish).
    const approval = await repos.approvals.findOne({ video_id: videoId, status: "approved" });
    if (!approval || video.status !== "approved") {
      throw new NonRetryableError(`Video ${videoId} is not approved (status=${video.status}). Publishing aborted.`, "NOT_APPROVED");
    }

    const publishedToday = await repos.videos.count({ status: "published" }, "published_at >= ?", [startOfUtcDay(clock.now()).toISOString()]);
    if (publishedToday >= config.pipeline.dailyVideoLimit) {
      throw new NonRetryableError(`DAILY_VIDEO_LIMIT (${config.pipeline.dailyVideoLimit}) reached; publish later with \`npm run retry\``, "DAILY_LIMIT");
    }
    if (!youtube.isMock && !config.youtube.uploadEnabled) {
      throw new NonRetryableError("Real upload disabled (YOUTUBE_UPLOAD_ENABLED=false). Nothing was sent to YouTube.", "UPLOAD_DISABLED");
    }

    const privacy = video.privacy_status === "public" && !config.youtube.allowPublic ? "private" : video.privacy_status;
    checkpoint();
    await repos.videos.update(videoId, { status: "publishing" });
    log.info("publish.start", `${youtube.isMock ? "[MOCK] Simulating" : "Uploading"} "${video.title}" as ${privacy}`, { video_id: videoId });

    let result;
    try {
      result = await youtube.uploadVideo({
        filePath: video.video_file_path,
        title: video.title,
        description: video.description,
        tags: video.tags,
        privacyStatus: privacy,
        categoryId: config.youtube.categoryId,
        madeForKids: false,
        containsSyntheticMedia: true,
      });
    } catch (err) {
      const status = err instanceof PublishUnknownStateError ? "publish_unknown" : isRetryable(err) ? "approved" : "publish_failed";
      await repos.videos.update(videoId, { status });
      throw err;
    }
    if (!result.youtubeVideoId) {
      await repos.videos.update(videoId, { status: "publish_unknown" });
      throw new PublishUnknownStateError("Upload returned no YouTube video ID");
    }

    await repos.videos.update(videoId, {
      status: "published",
      youtube_video_id: result.youtubeVideoId,
      youtube_url: result.url,
      privacy_status: privacy,
      published_at: clock.now().toISOString(),
    });
    if (video.idea_id) await repos.ideas.update(video.idea_id, { status: "used" });
    if (video.experiment_id) await experiments.attachVideo(video.experiment_id, videoId);
    this.ctx.bus.emit("video.published", { videoId, youtubeVideoId: result.youtubeVideoId });
    log.info("publish.done", `${youtube.isMock ? "[MOCK] " : ""}Published ${result.youtubeVideoId} (${privacy})`, { video_id: videoId });
    return this.publishedOutput((await repos.videos.get(videoId))!);
  }

  private publishedOutput(v: VideoRecord): Record<string, unknown> {
    return {
      video_id: v.video_id,
      youtube_video_id: v.youtube_video_id,
      url: v.youtube_url,
      privacy_status: v.privacy_status,
      is_mock: Boolean(v.is_mock),
    };
  }
}
