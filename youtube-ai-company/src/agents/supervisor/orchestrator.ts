import { existsSync, statSync } from "node:fs";
import { startOfUtcDay } from "../../core/clock.js";
import { newId } from "../../core/ids.js";
import type {
  AgentRecord,
  ApprovalRecord,
  PipelineRecord,
  PipelineStage,
  SystemEventRecord,
  TaskRecord,
  TaskStatus,
  TaskType,
  VideoRecord,
} from "../../database/types.js";
import { ACTIVE_TASK_STATUSES } from "../../database/types.js";
import type { AgentContext } from "../context.js";

const STAGE_OF: Record<TaskType, PipelineStage> = {
  research: "RESEARCH",
  script: "SCRIPT",
  quality_check: "QUALITY_CHECK",
  render: "RENDER",
  publish: "PUBLISH",
  analytics: "ANALYTICS",
  feedback: "FEEDBACK",
};

const TASK_OF: Partial<Record<PipelineStage, TaskType>> = {
  RESEARCH: "research",
  SCRIPT: "script",
  QUALITY_CHECK: "quality_check",
  RENDER: "render",
  PUBLISH: "publish",
  ANALYTICS: "analytics",
  FEEDBACK: "feedback",
};

export interface StartPipelineResult {
  pipeline: PipelineRecord | null;
  reason?: string;
}

export interface StatusReport {
  generated_at: string;
  mode: { mock: boolean; llm: string; youtube: string; auto_publish: boolean; upload_enabled: boolean };
  supervisor: { status: string; last_tick: string | null; next_actions: string[] };
  agents: AgentRecord[];
  tasks: Record<TaskStatus, number>;
  retries_total: number;
  running_tasks: TaskRecord[];
  pipelines: PipelineRecord[];
  pending_approvals: (ApprovalRecord & { title?: string })[];
  videos: { published: number; total_views: number; average_views: number | null; latest: VideoRecord | null };
  latest_analytics: Record<string, unknown> | null;
  daily: { created_today: number; published_today: number; limit: number };
  knowledge_entries: number;
  experiments: { name: string; variant: string; status: string; conclusion: string | null; samples: number }[];
  recent_errors: SystemEventRecord[];
}

/**
 * The Supervisor's orchestration brain. It never does an agent's job itself; it decides
 * what should happen next, verifies every hand-off produced a real deliverable,
 * recovers stalled pipelines, and escalates to humans.
 *
 * Every stage transition uses a conditional DB update (stage = expected), so concurrent
 * triggers (event + periodic tick, or multiple processes) can't create duplicate tasks.
 */
export class Supervisor {
  private lastTick: string | null = null;
  private unsubscribers: (() => void)[] = [];

  constructor(private readonly ctx: AgentContext) {}

  private get log() {
    return this.ctx.logger.child({ agent: "supervisor" });
  }

  attach(): void {
    const { bus } = this.ctx;
    this.unsubscribers.push(
      bus.on("task.completed", ({ task }) => this.onTaskCompleted(task)),
      bus.on("task.failed", ({ task, error }) => this.onTaskFailed(task, error)),
      bus.on("watchdog.alert", (a) => {
        this.log.warn("supervisor.watchdog_alert", `Watchdog: ${a.reason} → ${a.action}`, { task_id: a.taskId ?? undefined, target: a.agent });
      }),
    );
  }

  detach(): void {
    for (const u of this.unsubscribers) u();
    this.unsubscribers = [];
  }

  // ───────────────────────── Goals ─────────────────────────

  async dailyCounts(): Promise<{ createdToday: number; publishedToday: number }> {
    const { repos, clock } = this.ctx;
    const since = startOfUtcDay(clock.now()).toISOString();
    return {
      createdToday: await repos.pipelines.count({}, "created_at >= ? AND status != 'CANCELLED'", [since]),
      publishedToday: await repos.videos.count({ status: "published" }, "published_at >= ?", [since]),
    };
  }

  /** Entry point for the Goal "新しい動画を作る". Enforces DAILY_VIDEO_LIMIT. */
  async startPipeline(goal = "新しい動画を作る"): Promise<StartPipelineResult> {
    const { repos, tasks, config } = this.ctx;
    const { createdToday } = await this.dailyCounts();
    if (createdToday >= config.pipeline.dailyVideoLimit) {
      const reason = `DAILY_VIDEO_LIMIT reached (${createdToday}/${config.pipeline.dailyVideoLimit}). No new video today.`;
      this.log.warn("supervisor.daily_limit", reason);
      return { pipeline: null, reason };
    }
    const pipeline = await repos.pipelines.insert({
      pipeline_id: newId("pipe"),
      goal,
      status: "ACTIVE",
      stage: "RESEARCH",
      research_id: null,
      idea_id: null,
      script_id: null,
      video_id: null,
      analytics_id: null,
      experiment_id: null,
      revision_count: 0,
      error: null,
    });
    await tasks.create("research", { pipelineId: pipeline.pipeline_id, goal }, { pipelineId: pipeline.pipeline_id });
    this.log.info("supervisor.pipeline_started", `New pipeline for goal "${goal}"`, { pipeline_id: pipeline.pipeline_id });
    return { pipeline };
  }

  // ───────────────────────── Integrity ─────────────────────────

  /** Detects "completed but no deliverable" for each task type. Returns problems (empty = OK). */
  async verifyArtifacts(task: TaskRecord): Promise<string[]> {
    const { repos, artifacts } = this.ctx;
    const out = (task.output ?? {}) as Record<string, any>;
    const problems: string[] = [];
    switch (task.type) {
      case "research": {
        const r = out.research_id ? await repos.research.get(out.research_id) : undefined;
        if (!r) problems.push("research record missing");
        else if (!artifacts.exists(r.file_path)) problems.push(`research JSON missing: ${r.file_path}`);
        if (!out.selected_idea_id || !(await repos.ideas.get(out.selected_idea_id))) problems.push("selected idea missing");
        break;
      }
      case "script": {
        const s = out.script_id ? await repos.scripts.get(out.script_id) : undefined;
        if (!s) problems.push("script record missing");
        else if (!artifacts.exists(s.file_path)) problems.push(`script JSON missing: ${s.file_path}`);
        break;
      }
      case "quality_check": {
        if (out.passed === true) {
          if (!out.video_id || !(await repos.videos.get(out.video_id))) problems.push("video record missing after QC pass");
        } else if (out.passed === false) {
          const s = out.script_id ? await repos.scripts.get(out.script_id) : undefined;
          if (!s?.qc_report) problems.push("QC report missing on failed script");
        } else problems.push("QC result missing");
        break;
      }
      case "render": {
        const v = out.video_id ? await repos.videos.get(out.video_id) : undefined;
        if (!v) problems.push("video record missing after render");
        else if (!v.video_file_path || !existsSync(v.video_file_path) || statSync(v.video_file_path).size === 0) {
          problems.push(`rendered video file missing: ${v.video_file_path ?? "(none)"}`);
        }
        if (!out.approval_id || !(await repos.approvals.get(out.approval_id))) problems.push("approval request missing after render");
        break;
      }
      case "publish": {
        const v = out.video_id ? await repos.videos.get(out.video_id) : undefined;
        if (!v) problems.push("published video record missing");
        else if (!v.youtube_video_id || !out.youtube_video_id) problems.push("published but YouTube video ID is missing");
        else if (v.status !== "published") problems.push(`video status is ${v.status}, expected published`);
        break;
      }
      case "analytics": {
        const a = out.analytics_id ? await repos.analytics.get(out.analytics_id) : undefined;
        if (!a) problems.push("analytics record missing");
        else if (!artifacts.exists(a.file_path)) problems.push(`analytics JSON missing: ${a.file_path}`);
        break;
      }
      case "feedback": {
        const ids = (out.knowledge_ids as string[] | undefined) ?? [];
        if (!ids.length) problems.push("no knowledge entries recorded");
        else if (!(await repos.knowledge.get(ids[0]!))) problems.push("knowledge entries missing");
        break;
      }
    }
    return problems;
  }

  private async handleMissingArtifact(task: TaskRecord, problems: string[]): Promise<void> {
    const { tasks, notifier, repos } = this.ctx;
    const reason = `Artifact check failed: ${problems.join("; ")}`;
    this.log.error("supervisor.artifact_missing", reason, { task_id: task.task_id });

    if (task.type === "publish") {
      // Never re-run an upload automatically: it could create a duplicate public video.
      await repos.tasks.updateIf(task.task_id, { status: "COMPLETED" }, { status: "FAILED", error: reason, error_code: "ARTIFACT_MISSING" });
      if (task.pipeline_id) await this.failPipeline(task.pipeline_id, reason);
      await notifier.notify({
        level: "CRITICAL",
        title: "投稿済み扱いだがYouTube video IDがない",
        agent: task.agent,
        taskId: task.task_id,
        error: reason,
        retry: "自動リトライしない（二重投稿防止）",
        action: "YouTube Studioで実際の投稿状況を確認し、手動で対応してください",
      });
      return;
    }

    const status = await tasks.reopenForMissingArtifact(task, reason);
    if (task.pipeline_id && status === "RETRYING") {
      // Roll the pipeline back to this stage; anything downstream was built on a missing deliverable.
      const downstream = (await tasks.activeTasksForPipeline(task.pipeline_id)).filter((t) => t.task_id !== task.task_id);
      for (const t of downstream) await tasks.cancel(t.task_id, "Upstream artifact missing; stage is being re-run");
      await this.supersedePendingApprovals(task.pipeline_id);
      await repos.pipelines.update(task.pipeline_id, { stage: STAGE_OF[task.type], status: "ACTIVE", error: null });
    }
    await notifier.notify({
      level: status === "FAILED" ? "CRITICAL" : "WARN",
      title: "成果物欠落を検知",
      agent: task.agent,
      taskId: task.task_id,
      error: reason,
      retry: `${task.retry_count}/${task.max_retries}`,
      action: status === "FAILED" ? "最大リトライ超過。FAILED扱い。原因確認後 npm run retry" : "タスクを再実行します",
    });
  }

  private async supersedePendingApprovals(pipelineId: string): Promise<void> {
    const pending = await this.ctx.repos.approvals.list({ where: { pipeline_id: pipelineId, status: "pending" } });
    for (const a of pending) {
      await this.ctx.repos.approvals.update(a.approval_id, {
        status: "rejected",
        decided_by: "system:supervisor",
        decided_at: this.ctx.clock.now().toISOString(),
        note: "Superseded: upstream stage is being re-run",
      });
    }
  }

  // ───────────────────────── Workflow ─────────────────────────

  async onTaskCompleted(task: TaskRecord): Promise<void> {
    const problems = await this.verifyArtifacts(task);
    if (problems.length) {
      await this.handleMissingArtifact(task, problems);
      return;
    }
    await this.advance(task);
  }

  async onTaskFailed(task: TaskRecord, error: string): Promise<void> {
    const { notifier, repos } = this.ctx;
    await notifier.notify({
      level: "CRITICAL",
      title: `${task.type} タスクが失敗しました`,
      agent: task.agent,
      taskId: task.task_id,
      error,
      retry: `${task.retry_count}/${task.max_retries}${task.error_code ? ` (${task.error_code})` : ""}`,
      action:
        task.error_code === "PUBLISH_UNKNOWN_STATE"
          ? "YouTube Studioで投稿状況を確認してください（自動再投稿はしません）"
          : `原因を確認し、問題がなければ npm run retry -- ${task.task_id}`,
    });
    if (task.pipeline_id) {
      const p = await repos.pipelines.get(task.pipeline_id);
      if (p && (p.status === "ACTIVE" || p.status === "WAITING_APPROVAL")) await this.failPipeline(task.pipeline_id, `${task.type} failed: ${error}`);
    }
  }

  private async failPipeline(pipelineId: string, reason: string): Promise<void> {
    await this.ctx.repos.pipelines.update(pipelineId, { status: "FAILED", stage: "FAILED", error: reason });
    this.log.error("supervisor.pipeline_failed", reason, { pipeline_id: pipelineId });
  }

  private async move(p: string, from: PipelineStage, patch: Partial<PipelineRecord>): Promise<boolean> {
    return this.ctx.repos.pipelines.updateIf(p, { stage: from }, patch);
  }

  /** Decides and enqueues the next step after a verified task completion. */
  async advance(task: TaskRecord): Promise<void> {
    const { tasks, config, approvals, notifier, repos, clock } = this.ctx;
    const out = (task.output ?? {}) as Record<string, any>;
    const pid = task.pipeline_id;

    if (!pid) {
      // Ad-hoc tasks (e.g. manual analytics for an old video) still feed the learning loop.
      if (task.type === "analytics" && !(await this.hasTask("feedback", (t) => t.input.analyticsId === out.analytics_id))) {
        await tasks.create("feedback", { analyticsId: out.analytics_id, videoId: out.video_id ?? task.input.videoId });
      }
      return;
    }

    switch (task.type) {
      case "research":
        if (await this.move(pid, "RESEARCH", { stage: "SCRIPT", research_id: out.research_id, idea_id: out.selected_idea_id, experiment_id: out.experiment_id ?? null })) {
          await tasks.create("script", { pipelineId: pid, ideaId: out.selected_idea_id }, { pipelineId: pid });
        }
        break;

      case "script":
        if (await this.move(pid, "SCRIPT", { stage: "QUALITY_CHECK", script_id: out.script_id })) {
          await tasks.create("quality_check", { pipelineId: pid, scriptId: out.script_id }, { pipelineId: pid });
        }
        break;

      case "quality_check": {
        const pipeline = await repos.pipelines.get(pid);
        if (!pipeline) return;
        if (out.passed) {
          if (await this.move(pid, "QUALITY_CHECK", { stage: "RENDER", video_id: out.video_id })) {
            await tasks.create("render", { pipelineId: pid, videoId: out.video_id }, { pipelineId: pid });
          }
        } else if (pipeline.revision_count < config.pipeline.maxScriptRevisions) {
          if (await this.move(pid, "QUALITY_CHECK", { stage: "SCRIPT", revision_count: pipeline.revision_count + 1 })) {
            this.log.warn("supervisor.script_sent_back", `QC failed — revision ${pipeline.revision_count + 1}/${config.pipeline.maxScriptRevisions}`, { pipeline_id: pid });
            await tasks.create(
              "script",
              { pipelineId: pid, ideaId: pipeline.idea_id, previousScriptId: out.script_id, revisionNotes: out.revision_notes ?? [] },
              { pipelineId: pid },
            );
          }
        } else if (await this.move(pid, "QUALITY_CHECK", { stage: "FAILED", status: "FAILED", error: "QC failed after max script revisions" })) {
          await notifier.notify({
            level: "ERROR",
            title: "品質チェックを規定回数内に通過できませんでした",
            agent: "publisher",
            taskId: task.task_id,
            error: (out.revision_notes as string[] | undefined)?.slice(0, 3).join(" / ") ?? "QC failed",
            retry: `${config.pipeline.maxScriptRevisions}回の差し戻し済み`,
            action: "台本を確認し、新しいGoalを開始してください",
          });
        }
        break;
      }

      case "render":
        if (await this.move(pid, "RENDER", { stage: "WAITING_APPROVAL", status: "WAITING_APPROVAL", video_id: out.video_id })) {
          await tasks.create("publish", { pipelineId: pid, videoId: out.video_id, approvalId: out.approval_id }, { pipelineId: pid, status: "WAITING_APPROVAL" });
          if (config.pipeline.autoPublish) {
            this.log.warn("supervisor.auto_publish", "AUTO_PUBLISH=true: approving automatically", { pipeline_id: pid });
            await approvals.approve(out.approval_id, "system:auto_publish", { note: "AUTO_PUBLISH=true" });
          }
        }
        break;

      case "publish": {
        const runAt = new Date(clock.now().getTime() + config.youtube.analyticsDelayHours * 3_600_000);
        if (await this.move(pid, "PUBLISH", { stage: "ANALYTICS", status: "ACTIVE" })) {
          await tasks.create("analytics", { pipelineId: pid, videoId: out.video_id }, { pipelineId: pid, runAt });
          await notifier.notify({
            level: "INFO",
            title: `${out.is_mock ? "[MOCK] " : ""}投稿完了: ${String(out.youtube_video_id)} (${String(out.privacy_status)})`,
            agent: "publisher",
            taskId: task.task_id,
            action: `分析は ${runAt.toISOString()} 以降に実行`,
          });
          await this.maybeContinue(); // a production slot is free again; no need to wait for analytics
        }
        break;
      }

      case "analytics":
        if (await this.move(pid, "ANALYTICS", { stage: "FEEDBACK", analytics_id: out.analytics_id })) {
          await tasks.create("feedback", { pipelineId: pid, analyticsId: out.analytics_id, videoId: task.input.videoId }, { pipelineId: pid });
        }
        break;

      case "feedback":
        if (await this.move(pid, "FEEDBACK", { stage: "COMPLETED", status: "COMPLETED" })) {
          this.log.info("supervisor.pipeline_completed", "Pipeline completed; learnings stored in Knowledge Base", {
            pipeline_id: pid,
            knowledge_entries: (out.knowledge_ids as string[] | undefined)?.length ?? 0,
          });
          await this.maybeContinue();
        }
        break;
    }
  }

  private async hasTask(type: TaskType, match: (t: TaskRecord) => boolean): Promise<boolean> {
    return (await this.ctx.repos.tasks.list({ where: { type } })).some(match);
  }

  private autopilotPausedReason: string | null = null;

  /**
   * Auto-continue (autopilot): keeps up to AUTOPILOT_MAX_CONCURRENT videos in production,
   * spaced by AUTOPILOT_MIN_INTERVAL_MINUTES, capped by DAILY_VIDEO_LIMIT, and paused by a
   * circuit breaker after AUTOPILOT_MAX_CONSECUTIVE_FAILURES failed pipelines in a row.
   * Videos waiting for analytics don't block the next production.
   */
  async maybeContinue(): Promise<string | null> {
    const { config, repos, clock, notifier } = this.ctx;
    const p = config.pipeline;
    if (!p.autoContinue) return null;

    const recent = await repos.pipelines.list({ limit: p.autopilotMaxConsecutiveFailures, orderBy: "created_at DESC" });
    const tripped = recent.length >= p.autopilotMaxConsecutiveFailures && recent.every((r) => r.status === "FAILED");
    if (tripped) {
      const reason = `${p.autopilotMaxConsecutiveFailures} pipelines failed in a row`;
      if (this.autopilotPausedReason !== reason) {
        this.autopilotPausedReason = reason;
        await notifier.notify({
          level: "CRITICAL",
          title: "オートパイロットを一時停止しました",
          agent: "supervisor",
          error: reason,
          retry: "自動再開しない（暴走防止）",
          action: "原因を確認して修正後、npm run goal で1本成功させると再開します",
        });
      }
      return null;
    }
    this.autopilotPausedReason = null;

    const inProduction =
      (await repos.pipelines.count({ status: "ACTIVE", stage: ["RESEARCH", "SCRIPT", "QUALITY_CHECK", "RENDER", "PUBLISH"] })) +
      (await repos.pipelines.count({ status: "WAITING_APPROVAL" }));
    if (inProduction >= p.autopilotMaxConcurrent) return null;

    const last = recent[0];
    if (last && clock.now().getTime() - new Date(last.created_at).getTime() < p.autopilotMinIntervalMinutes * 60_000) return null;

    const r = await this.startPipeline("新しい動画を作る (autopilot)");
    if (!r.pipeline) {
      this.log.info("supervisor.auto_continue_paused", r.reason ?? "not started");
      return null;
    }
    return r.pipeline.pipeline_id;
  }

  /** Human retry: re-queue a FAILED task and re-activate its pipeline. */
  async retryTask(taskId: string): Promise<boolean> {
    const { tasks, repos } = this.ctx;
    const task = await repos.tasks.get(taskId);
    if (!task || task.status !== "FAILED") return false;
    if (task.type === "publish") {
      const video = await repos.videos.get(String(task.input.videoId));
      if (video?.status === "publish_unknown") {
        throw new Error("This upload ended in an unknown state. Verify YouTube Studio, then set the video status manually before retrying.");
      }
      if (video?.status === "publish_failed") await repos.videos.update(video.video_id, { status: "approved" });
    }
    const ok = await tasks.manualRetry(taskId);
    if (ok && task.pipeline_id) {
      await repos.pipelines.update(task.pipeline_id, { status: "ACTIVE", stage: STAGE_OF[task.type], error: null });
    }
    return ok;
  }

  // ───────────────────────── Periodic supervision ─────────────────────────

  /** One supervision cycle. Safe to call repeatedly and from multiple processes. */
  async tick(): Promise<string[]> {
    const { state, clock } = this.ctx;
    await state.heartbeat("supervisor", { status: "running", currentTask: "supervision cycle" });
    const actions: string[] = [];
    try {
      actions.push(...(await this.auditActivePipelines()));
      actions.push(...(await this.ensureAnalyticsAndFeedback()));
      const started = await this.maybeContinue();
      if (started) actions.push(`autopilot_started:${started}`);
    } finally {
      this.lastTick = clock.now().toISOString();
      await state.heartbeat("supervisor", { status: "idle", currentTask: null, taskId: null });
    }
    if (actions.length) this.log.info("supervisor.tick", `Supervision cycle took ${actions.length} action(s)`, { actions });
    return actions;
  }

  private async auditActivePipelines(): Promise<string[]> {
    const { repos, tasks, approvals } = this.ctx;
    const actions: string[] = [];
    const pipelines = await repos.pipelines.list({ where: { status: ["ACTIVE", "WAITING_APPROVAL"] } });
    for (const p of pipelines) {
      const all = await repos.tasks.list({ where: { pipeline_id: p.pipeline_id }, orderBy: "created_at DESC" });

      // 1) Completed-but-missing deliverables.
      let rolledBack = false;
      for (const t of all.filter((t) => t.status === "COMPLETED")) {
        const problems = await this.verifyArtifacts(t);
        if (problems.length) {
          await this.handleMissingArtifact(t, problems);
          actions.push(`artifact_missing:${t.task_id}`);
          rolledBack = true;
          break;
        }
      }
      if (rolledBack) continue;

      // 2) Stalled pipelines: no active task although the pipeline is not waiting on a human.
      const active = all.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status));
      if (p.status === "WAITING_APPROVAL") {
        if (!active.some((t) => t.type === "publish") && p.video_id) {
          const approval = await repos.approvals.findOne({ video_id: p.video_id });
          await tasks.create("publish", { pipelineId: p.pipeline_id, videoId: p.video_id, approvalId: approval?.approval_id }, { pipelineId: p.pipeline_id, status: approval?.status === "approved" ? "PENDING" : "WAITING_APPROVAL" });
          actions.push(`recreated_publish_task:${p.pipeline_id}`);
        }
        continue;
      }
      if (active.length) continue;
      const stageType = TASK_OF[p.stage];
      if (!stageType) continue;
      const latest = all.find((t) => t.type === stageType);
      if (latest?.status === "COMPLETED") {
        await this.advance(latest);
        actions.push(`advanced_stalled:${p.pipeline_id}`);
      } else if (latest?.status === "FAILED") {
        await this.failPipeline(p.pipeline_id, latest.error ?? `${stageType} failed`);
        actions.push(`failed_pipeline:${p.pipeline_id}`);
      } else if (!latest || latest.status === "CANCELLED") {
        const input = await this.inputForStage(p);
        if (input) {
          const pending = stageType === "publish" ? (await approvals.pending()).some((a) => a.video_id === p.video_id) : false;
          await tasks.create(stageType, input, { pipelineId: p.pipeline_id, status: pending ? "WAITING_APPROVAL" : "PENDING" });
          actions.push(`recreated_task:${stageType}:${p.pipeline_id}`);
        } else {
          await this.failPipeline(p.pipeline_id, `Cannot rebuild input for stage ${p.stage}`);
          actions.push(`failed_pipeline:${p.pipeline_id}`);
        }
      }
    }
    return actions;
  }

  private async inputForStage(p: PipelineRecord): Promise<Record<string, unknown> | null> {
    switch (p.stage) {
      case "RESEARCH":
        return { pipelineId: p.pipeline_id, goal: p.goal };
      case "SCRIPT":
        return p.idea_id ? { pipelineId: p.pipeline_id, ideaId: p.idea_id } : null;
      case "QUALITY_CHECK":
        return p.script_id ? { pipelineId: p.pipeline_id, scriptId: p.script_id } : null;
      case "RENDER":
        return p.video_id ? { pipelineId: p.pipeline_id, videoId: p.video_id } : null;
      case "PUBLISH":
        return p.video_id ? { pipelineId: p.pipeline_id, videoId: p.video_id } : null;
      case "ANALYTICS":
        return p.video_id ? { pipelineId: p.pipeline_id, videoId: p.video_id } : null;
      case "FEEDBACK":
        return p.analytics_id ? { pipelineId: p.pipeline_id, analyticsId: p.analytics_id, videoId: p.video_id } : null;
      default:
        return null;
    }
  }

  /** Published videos must get analytics; analytics must be reflected in the Knowledge Base. */
  private async ensureAnalyticsAndFeedback(): Promise<string[]> {
    const { repos, tasks } = this.ctx;
    const actions: string[] = [];
    const videos = await repos.videos.list({ where: { status: "published", pipeline_id: null } });
    for (const v of videos) {
      const hasAnalytics = (await repos.analytics.count({ video_id: v.video_id })) > 0;
      if (!hasAnalytics && !(await this.hasTask("analytics", (t) => t.input.videoId === v.video_id && t.status !== "FAILED"))) {
        await tasks.create("analytics", { videoId: v.video_id });
        actions.push(`queued_analytics:${v.video_id}`);
      }
    }
    const completed = await repos.pipelines.list({ where: { status: "COMPLETED" }, limit: 20 });
    for (const p of completed) {
      if (!p.video_id || !p.analytics_id) continue;
      const kb = await repos.knowledge.count({ video_id: p.video_id });
      if (kb === 0 && !(await this.hasTask("feedback", (t) => t.input.analyticsId === p.analytics_id && ACTIVE_TASK_STATUSES.includes(t.status)))) {
        this.log.warn("supervisor.kb_not_reflected", "Completed pipeline has no Knowledge Base entries; re-queuing feedback", { pipeline_id: p.pipeline_id });
        await tasks.create("feedback", { analyticsId: p.analytics_id, videoId: p.video_id });
        actions.push(`requeued_feedback:${p.pipeline_id}`);
      }
    }
    return actions;
  }

  // ───────────────────────── Reporting ─────────────────────────

  async nextActions(): Promise<string[]> {
    const { repos, config } = this.ctx;
    const out: string[] = [];
    const pending = await repos.approvals.count({ status: "pending" });
    if (pending) out.push(`人間の承認待ち ${pending}件 → npm run approvals / Dashboard`);
    const failed = await repos.tasks.count({ status: "FAILED" });
    if (failed) out.push(`FAILEDタスク ${failed}件 → 原因確認後 npm run retry -- <task_id>`);
    for (const p of await repos.pipelines.list({ where: { status: "ACTIVE" } })) {
      const t = TASK_OF[p.stage];
      out.push(`pipeline ${p.pipeline_id}: ${p.stage}${t ? `（${t} を処理/待機中）` : ""}`);
    }
    const { createdToday } = await this.dailyCounts();
    if (!(await repos.pipelines.count({ status: "ACTIVE" }))) {
      out.push(
        createdToday >= config.pipeline.dailyVideoLimit
          ? `本日の上限(${config.pipeline.dailyVideoLimit})に到達 → 明日まで新規制作なし`
          : "新しい動画を作る → npm run goal",
      );
    }
    return out;
  }

  async statusReport(): Promise<StatusReport> {
    const { repos, config, tasks, clock } = this.ctx;
    const supervisorAgent = await repos.agents.get("supervisor");
    const published = await repos.videos.list({ where: { status: "published" } });
    const analytics = await repos.analytics.list({ limit: 200 });
    const viewsByVideo = new Map<string, number>();
    for (const a of [...analytics].reverse()) {
      const v = Number((a.metrics as Record<string, unknown>).views);
      if (Number.isFinite(v)) viewsByVideo.set(a.video_id, v);
    }
    const totalViews = [...viewsByVideo.values()].reduce((s, v) => s + v, 0);
    const latestAnalytics = analytics[0];
    const pendingApprovals = await repos.approvals.list({ where: { status: "pending" }, orderBy: "requested_at ASC" });
    const titles = new Map((await repos.videos.list({ where: { video_id: pendingApprovals.map((a) => a.video_id) } })).map((v) => [v.video_id, v.title]));
    const { createdToday, publishedToday } = await this.dailyCounts();
    const retries = await repos.db.get<{ n: number }>("SELECT COALESCE(SUM(retry_count), 0) AS n FROM tasks");
    return {
      generated_at: clock.now().toISOString(),
      mode: {
        mock: config.mockMode,
        llm: `${this.ctx.llm.name}/${this.ctx.llm.model}`,
        youtube: this.ctx.youtube.name,
        auto_publish: config.pipeline.autoPublish,
        upload_enabled: config.youtube.uploadEnabled,
      },
      supervisor: { status: supervisorAgent?.status ?? "unknown", last_tick: this.lastTick ?? supervisorAgent?.last_heartbeat ?? null, next_actions: await this.nextActions() },
      agents: await repos.agents.list({ orderBy: "name ASC" }),
      tasks: await tasks.counts(),
      retries_total: Number(retries?.n ?? 0),
      running_tasks: await repos.tasks.list({ where: { status: ["RUNNING", "RETRYING", "PENDING", "WAITING_APPROVAL"] }, orderBy: "created_at ASC", limit: 20 }),
      pipelines: await repos.pipelines.list({ limit: 10 }),
      pending_approvals: pendingApprovals.map((a) => ({ ...a, title: titles.get(a.video_id) })),
      videos: {
        published: published.length,
        total_views: totalViews,
        average_views: viewsByVideo.size ? Math.round(totalViews / viewsByVideo.size) : null,
        latest: published[0] ?? null,
      },
      latest_analytics: latestAnalytics ? { analytics_id: latestAnalytics.analytics_id, video_id: latestAnalytics.video_id, performance_score: latestAnalytics.performance_score, ...latestAnalytics.report, metrics: latestAnalytics.metrics } : null,
      daily: { created_today: createdToday, published_today: publishedToday, limit: config.pipeline.dailyVideoLimit },
      knowledge_entries: await repos.knowledge.count(),
      experiments: (await repos.experiments.list({ orderBy: "created_at ASC" })).map((e) => ({
        name: e.name,
        variant: e.variant,
        status: e.status,
        conclusion: e.conclusion,
        samples: e.video_ids.length,
      })),
      recent_errors: await repos.events.list({ where: { level: ["ERROR", "CRITICAL"] }, limit: 10 }),
    };
  }
}
