import fs from "node:fs";
import type { AppConfig } from "../../config";
import type { EventBus } from "../../core/events/eventBus";
import type { AgentRunner } from "../../core/runner";
import { scheduleFor } from "../../core/scheduler/scheduler";
import type { TaskManager } from "../../core/tasks/taskManager";
import type { HeartbeatRegistry } from "../../core/watchdog/heartbeat";
import type { Watchdog, WatchdogAction } from "../../core/watchdog/watchdog";
import type { Repository } from "../../database/repositories";
import { KnowledgeBase } from "../../knowledge/knowledgeBase";
import type { Logger } from "../../logger";
import type { Task } from "../../types";
import { localDateKey, newId } from "../../utils";
import type { Agent, AgentContext, AgentResult } from "../base";
import { NonRetryableError } from "../base";

/** Supervisor's own task: write analytics results into the Knowledge Base. */
export class KnowledgeAgent implements Agent {
  readonly name = "supervisor" as const;
  constructor(private readonly ctx: AgentContext) {}

  async handle(task: Task): Promise<AgentResult> {
    if (task.type !== "knowledge") throw new NonRetryableError(`supervisor cannot run ${task.type}`);
    const { repo } = this.ctx;
    const id = String(task.input.article_id ?? "");
    const article = repo.getArticle(id);
    const analytics = repo.latestAnalytics(id);
    if (!article || !analytics) throw new NonRetryableError(`article/analytics not found: ${id}`);
    const strategy = repo.getStrategy(article.strategy_id);
    const idea = repo.getIdea(article.idea_id);
    if (!strategy || !idea) throw new NonRetryableError(`strategy/idea not found for ${id}`);
    const kb = new KnowledgeBase(repo);
    if (!repo.hasKnowledgeForArticle(id, "article_outcome")) {
      const metrics = {
        views: analytics.views,
        likes: analytics.likes,
        comments: analytics.comments,
        sales: analytics.sales,
        revenue: analytics.sales !== null ? analytics.sales * article.price : null,
        follower_growth: null,
        source: analytics.is_simulated ? ("simulation" as const) : ("note" as const),
      };
      kb.recordOutcome(article, strategy, idea, analytics, metrics);
    }
    const summary = kb.refreshInsights();
    return { kind: "completed", output: { article_id: id, knowledge_articles: summary.article_count, insights: summary.insights.length, notes: summary.notes } };
  }
}

export interface HealthReport {
  generated_at: string;
  agents: { agent: string; status: string; last_heartbeat: string; stale: boolean; restarts: number; last_error: string | null }[];
  tasks: Record<string, number>;
  stuck_tasks: string[];
  missing_article_files: string[];
  drafts_pending_approval: number;
  published_without_analytics: string[];
  failed_tasks: { task_id: string; type: string; error: string | null }[];
  articles_today: number;
  daily_limit: number;
  should_create_next_article: boolean;
}

/**
 * SUPERVISOR: owns the daily loop. Each tick it
 *  - runs the watchdog,
 *  - creates today's research task while under DAILY_ARTICLE_LIMIT,
 *  - executes due tasks through the runner (which chains the pipeline),
 *  - and can report system health.
 */
export class Supervisor {
  private running = false;
  private stopRequested = false;
  /** Ticks never overlap (the loop and dashboard actions may both trigger one). */
  private ticking = false;

  constructor(
    private readonly config: AppConfig,
    private readonly repo: Repository,
    private readonly tasks: TaskManager,
    private readonly heartbeats: HeartbeatRegistry,
    private readonly runner: AgentRunner,
    private readonly watchdog: Watchdog,
    private readonly events: EventBus,
    private readonly logger: Logger,
  ) {}

  articlesStartedToday(now = new Date()): number {
    const key = localDateKey(now);
    return this.tasks
      .list({ type: "research" })
      .filter((t) => t.pipeline_id && t.input.mode !== "candidates" && t.status !== "CANCELLED" && localDateKey(new Date(t.created_at)) === key).length;
  }

  /** Creates a new article pipeline if today's quota allows. Returns the research task or null. */
  ensureDailyResearch(now = new Date(), opts: { force?: boolean } = {}): Task | null {
    const today = this.articlesStartedToday(now);
    if (today >= this.config.dailyArticleLimit) {
      if (opts.force) this.logger.warn(`DAILY_ARTICLE_LIMIT (${this.config.dailyArticleLimit}) reached; not creating a new article today`);
      return null;
    }
    const pipelineId = newId("pipe");
    const t = this.tasks.create({ agent: "researcher", type: "research", input: { count: 3 }, pipelineId, scheduledAt: opts.force ? null : scheduleFor("research", this.config.schedule, now) });
    this.events.system("info", "supervisor.daily_research", `article ${today + 1}/${this.config.dailyArticleLimit} for ${localDateKey(now)} started`, { task_id: t.task_id });
    return t;
  }

  /** One supervisor cycle. */
  async tick(opts: { createDaily?: boolean; maxTasks?: number; now?: Date } = {}): Promise<{ watchdog: WatchdogAction[]; ran: Task[] }> {
    if (this.ticking) return { watchdog: [], ran: [] };
    this.ticking = true;
    try {
      return await this.tickInner(opts);
    } finally {
      this.ticking = false;
    }
  }

  private async tickInner(opts: { createDaily?: boolean; maxTasks?: number; now?: Date }): Promise<{ watchdog: WatchdogAction[]; ran: Task[] }> {
    const now = opts.now ?? new Date();
    this.heartbeats.beat("supervisor", "running", null);
    const watchdog = await this.watchdog.check(now);
    if (opts.createDaily ?? true) this.ensureDailyResearch(now);
    const ran: Task[] = [];
    const max = opts.maxTasks ?? 50;
    while (ran.length < max && !this.stopRequested) {
      const next = this.tasks.runnable(new Date())[0];
      if (!next) break;
      ran.push(await this.runner.run(next));
    }
    this.heartbeats.beat("supervisor", "idle", null);
    return { watchdog, ran };
  }

  /** Runs ticks until nothing is runnable (used by CLI one-shots and tests). */
  async runUntilIdle(opts: { createDaily?: boolean; maxTicks?: number } = {}): Promise<Task[]> {
    const all: Task[] = [];
    for (let i = 0; i < (opts.maxTicks ?? 20); i++) {
      const { ran } = await this.tick({ createDaily: i === 0 ? opts.createDaily : false });
      all.push(...ran);
      if (!ran.length) break;
    }
    return all;
  }

  /** Endless loop for `npm run supervisor` / `npm run start`. */
  async loop(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stopRequested = false;
    const recovered = await this.watchdog.recoverAfterRestart();
    if (recovered.length) this.logger.warn(`recovered ${recovered.length} task(s) left RUNNING by a previous process`);
    this.logger.info(`Supervisor started (tick=${this.config.supervisorTickSeconds}s, limit=${this.config.dailyArticleLimit}/day, auto_publish=${this.config.note.autoPublish})`);
    // The watchdog runs on its own timer so a hung task (which blocks the
    // current tick) is still detected and aborted.
    const wd = setInterval(() => {
      this.watchdog.check().catch((e) => this.events.system("error", "watchdog.check_failed", (e as Error).message));
    }, Math.max(5, this.config.heartbeatIntervalSeconds) * 1000);
    wd.unref();
    try {
      while (!this.stopRequested) {
        try {
          await this.tick();
        } catch (e) {
          this.events.system("error", "supervisor.tick_failed", (e as Error).message);
        }
        await new Promise((r) => setTimeout(r, this.config.supervisorTickSeconds * 1000));
      }
    } finally {
      clearInterval(wd);
      this.running = false;
    }
  }

  stop(): void {
    this.stopRequested = true;
  }

  health(now = new Date()): HealthReport {
    const timeout = this.config.agentTimeoutMinutes * 60_000;
    const agents = this.heartbeats.all().map((h) => ({
      agent: h.agent,
      status: h.status,
      last_heartbeat: h.last_heartbeat,
      stale: h.status === "running" && now.getTime() - new Date(h.last_heartbeat).getTime() > timeout,
      restarts: h.restarts,
      last_error: h.last_error,
    }));
    const stuck = this.tasks
      .list({ status: "RUNNING" })
      .filter((t) => t.started_at && now.getTime() - new Date(t.started_at).getTime() > timeout)
      .map((t) => t.task_id);
    const missingFiles = this.repo
      .listArticles(100)
      .filter((a) => a.file_path && !fs.existsSync(a.file_path))
      .map((a) => a.article_id);
    const published = this.repo.listPublished(100);
    const noAnalytics = published.filter((p) => !this.repo.latestAnalytics(p.article_id)).map((p) => p.article_id);
    const failed = this.tasks.list({ status: "FAILED" }).slice(-10).map((t) => ({ task_id: t.task_id, type: t.type, error: t.error }));
    const today = this.articlesStartedToday(now);
    return {
      generated_at: now.toISOString(),
      agents,
      tasks: this.tasks.counts(),
      stuck_tasks: stuck,
      missing_article_files: missingFiles,
      drafts_pending_approval: this.repo.pendingApprovals().length,
      published_without_analytics: noAnalytics,
      failed_tasks: failed,
      articles_today: today,
      daily_limit: this.config.dailyArticleLimit,
      should_create_next_article: today < this.config.dailyArticleLimit,
    };
  }
}
