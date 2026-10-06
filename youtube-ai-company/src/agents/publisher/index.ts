import { existsSync } from "node:fs";
import path from "node:path";
import { deliverVideo } from "../../delivery/index.js";
import { startOfUtcDay } from "../../core/clock.js";
import { InvalidInputError, NonRetryableError, PublishUnknownStateError, isRetryable } from "../../core/errors.js";
import { newId } from "../../core/ids.js";
import type { TaskRecord, VideoRecord } from "../../database/types.js";
import { completeJson } from "../../llm/index.js";
import { PLACEHOLDER_SUFFIX } from "../../video/renderer.js";
import { BaseAgent, type ExecutionContext } from "../base-agent.js";
import { QCReviewSchema, ScriptOutputSchema, type QCIssue } from "../schemas.js";
import { humanChecklist, isValidTitle, runQualityRules } from "./quality-rules.js";

/** QC passes only with zero blockers, at most this many majors, and an LLM score >= MIN_REVIEW_SCORE. */
const MAX_MAJOR_ISSUES = 3;
const MIN_REVIEW_SCORE = 60;

/**
 * 社員3: Publisher / Quality Controller — 品質管理責任者.
 * A) quality_check: rule checks + LLM review -> render, or send back to Script Writer.
 * render: produces the actual video file (TTS + captions) -> READY_FOR_APPROVAL.
 * B) publish: uploads only approved videos; aborts on any unknown state.
 */
export class PublisherAgent extends BaseAgent {
  readonly name = "publisher" as const;
  readonly handles = ["quality_check" as const, "render" as const, "publish" as const];

  protected async execute(task: TaskRecord, exec: ExecutionContext): Promise<Record<string, unknown>> {
    if (task.type === "quality_check") return this.qualityCheck(task, exec);
    if (task.type === "render") return this.renderVideo(task, exec);
    if (task.type === "publish") return this.publish(task, exec);
    throw new InvalidInputError(`Publisher cannot handle task type ${task.type}`);
  }

  private async qualityCheck(task: TaskRecord, { log, checkpoint }: ExecutionContext): Promise<Record<string, unknown>> {
    const { config, repos, llm, prompts, youtube } = this.ctx;
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
      human_checklist: humanChecklist(script),
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
      delivery_path: null,
      status: "rendering",
      is_mock: youtube.isMock ? 1 : 0,
      published_at: null,
    });
    log.info("qc.passed", `QC passed: "${title}" (score ${review.overall_score}) → rendering`, {
      video_id: videoId,
      minor_issues: report.counts.minor,
    });
    return { passed: true, script_id: scriptId, video_id: videoId, status: "RENDERING", qc_report: report };
  }

  /** Renders the video file, verifies it, and only then asks for approval (humans review the real video). */
  private async renderVideo(task: TaskRecord, { log, checkpoint }: ExecutionContext): Promise<Record<string, unknown>> {
    const { config, repos, renderer, approvals, youtube } = this.ctx;
    const videoId = task.input.videoId;
    if (typeof videoId !== "string") throw new InvalidInputError("render requires videoId");
    const video = await repos.videos.get(videoId);
    if (!video) throw new InvalidInputError(`Video ${videoId} not found`);
    const scriptRow = await repos.scripts.get(video.script_id);
    const parsed = ScriptOutputSchema.safeParse(scriptRow?.content);
    if (!parsed.success) throw new InvalidInputError(`Script for ${videoId} is missing or malformed`);

    checkpoint();
    const outPath = path.join(config.dataDir, "videos", `${videoId}.mp4`);
    const result = await renderer.render(parsed.data, outPath, { maxDurationSec: config.pipeline.shortsMaxDurationSec });
    if (result.placeholder && !youtube.isMock) {
      throw new NonRetryableError("Placeholder renderer cannot be used with real YouTube (set VIDEO_RENDERER=ffmpeg)", "PLACEHOLDER_VIDEO");
    }
    const description = [video.description, ...result.credits.filter((c) => !video.description.includes(c))].join("\n");
    if (config.publishTarget === "delivery") {
      // Delivery mode: the human reviews and uploads the delivered file, so no approval gate here.
      await repos.videos.update(videoId, { video_file_path: result.filePath, description, status: "rendered" });
      log.info("render.done", `Rendered "${video.title}" (${result.durationSec}s) → delivery`, { video_id: videoId, file: result.filePath });
      return {
        video_id: videoId,
        file_path: result.filePath,
        duration_sec: result.durationSec,
        has_narration: result.hasNarration,
        placeholder: result.placeholder,
        approval_id: null,
        status: "RENDERED",
      };
    }
    await repos.videos.update(videoId, { video_file_path: result.filePath, description, status: "ready_for_approval" });
    const approval = await approvals.request(videoId, task.pipeline_id, video.title);
    log.info("render.ready_for_approval", `READY_FOR_APPROVAL: "${video.title}" (${result.durationSec}s video rendered)`, {
      video_id: videoId,
      file: result.filePath,
      speedup: result.speedup,
      approval_id: approval.approval_id,
    });
    return {
      video_id: videoId,
      file_path: result.filePath,
      duration_sec: result.durationSec,
      has_narration: result.hasNarration,
      placeholder: result.placeholder,
      approval_id: approval.approval_id,
      status: "READY_FOR_APPROVAL",
    };
  }

  private async publish(task: TaskRecord, { log, checkpoint }: ExecutionContext): Promise<Record<string, unknown>> {
    const { config, repos, youtube, clock, experiments } = this.ctx;
    const videoId = task.input.videoId;
    if (typeof videoId !== "string") throw new InvalidInputError("publish requires videoId");
    const video = await repos.videos.get(videoId);
    if (!video) throw new InvalidInputError(`Video ${videoId} not found`);

    if (config.publishTarget === "delivery") return this.deliver(video, { log, checkpoint });

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

    const publishedToday = await repos.videos.count({ status: ["published", "delivered"] }, "published_at >= ?", [startOfUtcDay(clock.now()).toISOString()]);
    if (publishedToday >= config.pipeline.dailyVideoLimit) {
      throw new NonRetryableError(`DAILY_VIDEO_LIMIT (${config.pipeline.dailyVideoLimit}) reached; publish later with \`npm run retry\``, "DAILY_LIMIT");
    }
    if (!youtube.isMock && !config.youtube.uploadEnabled) {
      throw new NonRetryableError("Real upload disabled (YOUTUBE_UPLOAD_ENABLED=false). Nothing was sent to YouTube.", "UPLOAD_DISABLED");
    }

    if (!youtube.isMock && video.video_file_path?.endsWith(PLACEHOLDER_SUFFIX)) {
      throw new NonRetryableError("Refusing to upload a placeholder video to YouTube", "PLACEHOLDER_VIDEO");
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

  /** PUBLISH_TARGET=delivery: hand the finished video to the human as a ready-to-upload folder. */
  private async deliver(video: VideoRecord, { log, checkpoint }: Pick<ExecutionContext, "log" | "checkpoint">): Promise<Record<string, unknown>> {
    const { config, repos, clock, experiments, renderer } = this.ctx;
    if (video.status === "delivered" && video.delivery_path && existsSync(video.delivery_path)) {
      log.warn("deliver.already_delivered", "Video already delivered; skipping", { delivery_path: video.delivery_path });
      return { video_id: video.video_id, delivery_path: video.delivery_path, delivered: true };
    }
    if (!video.video_file_path || !existsSync(video.video_file_path)) {
      throw new NonRetryableError(`Rendered video file missing for ${video.video_id}`, "NO_VIDEO_FILE");
    }
    const deliveredToday = await repos.videos.count({ status: ["published", "delivered"] }, "published_at >= ?", [startOfUtcDay(clock.now()).toISOString()]);
    if (deliveredToday >= config.pipeline.dailyVideoLimit) {
      throw new NonRetryableError(`DAILY_VIDEO_LIMIT (${config.pipeline.dailyVideoLimit}) reached`, "DAILY_LIMIT");
    }
    const scriptRow = await repos.scripts.get(video.script_id);
    const parsed = ScriptOutputSchema.safeParse(scriptRow?.content);
    if (!parsed.success) throw new InvalidInputError(`Script for ${video.video_id} is missing or malformed`);

    checkpoint();
    const result = await deliverVideo(video, parsed.data, {
      deliveryDir: config.deliveryDir,
      now: clock.now(),
      ffmpegPath: config.video.ffmpegPath,
      aiVoice: config.video.tts.provider !== "silent",
      placeholder: renderer.name === "placeholder" || video.video_file_path.endsWith(PLACEHOLDER_SUFFIX),
    });
    await repos.videos.update(video.video_id, { status: "delivered", delivery_path: result.folder, published_at: clock.now().toISOString() });
    if (video.idea_id) await repos.ideas.update(video.idea_id, { status: "used" });
    if (video.experiment_id) await experiments.attachVideo(video.experiment_id, video.video_id);
    log.info("deliver.done", `Delivered "${video.title}" → ${result.folder}`, { video_id: video.video_id });
    return {
      video_id: video.video_id,
      delivery_path: result.folder,
      video_file: result.videoFile,
      info_file: result.infoFile,
      thumbnail_file: result.thumbnailFile,
      delivered: true,
    };
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
