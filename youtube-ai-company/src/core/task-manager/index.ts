import type { Clock } from "../clock.js";
import { errorMessage, isRetryable, AppError } from "../errors.js";
import type { EventBus } from "../event-bus/index.js";
import { newId } from "../ids.js";
import { backoffDelay } from "../retry.js";
import type { Repositories } from "../../database/repositories.js";
import type { AgentName, TaskRecord, TaskStatus, TaskType } from "../../database/types.js";
import { ACTIVE_TASK_STATUSES } from "../../database/types.js";
import type { Logger } from "../../logging/logger.js";

export const TASK_AGENT: Record<TaskType, AgentName> = {
  research: "researcher",
  script: "scriptwriter",
  quality_check: "publisher",
  publish: "publisher",
  analytics: "analyst",
  feedback: "supervisor",
};

export interface CreateTaskOptions {
  pipelineId?: string | null;
  priority?: number;
  status?: Extract<TaskStatus, "PENDING" | "WAITING_APPROVAL">;
  runAt?: Date;
  maxRetries?: number;
}

export interface FailOptions {
  /** Force no retry regardless of error type. */
  retryable?: boolean;
  code?: string;
}

/**
 * Owns the task lifecycle: PENDING -> RUNNING -> COMPLETED | RETRYING | FAILED,
 * plus WAITING_APPROVAL and CANCELLED. Retries are bounded by max_retries.
 */
export class TaskManager {
  constructor(
    private readonly repos: Repositories,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly defaults: { maxRetries: number; retryBaseDelayMs: number },
  ) {}

  async create(type: TaskType, input: Record<string, unknown>, opts: CreateTaskOptions = {}): Promise<TaskRecord> {
    const now = this.clock.now().toISOString();
    const task = await this.repos.tasks.insert({
      task_id: newId("task"),
      type,
      agent: TASK_AGENT[type],
      status: opts.status ?? "PENDING",
      pipeline_id: opts.pipelineId ?? null,
      priority: opts.priority ?? 0,
      input,
      output: null,
      error: null,
      error_code: null,
      retry_count: 0,
      max_retries: opts.maxRetries ?? this.defaults.maxRetries,
      attempt: 0,
      started_at: null,
      completed_at: null,
      heartbeat_at: null,
      next_run_at: opts.runAt ? opts.runAt.toISOString() : now,
    });
    this.logger.info("task.created", `Created ${type} task for ${task.agent}`, {
      task_id: task.task_id,
      pipeline_id: task.pipeline_id,
      status: task.status,
    });
    this.bus.emit("task.created", { task });
    return task;
  }

  async get(taskId: string): Promise<TaskRecord | undefined> {
    return this.repos.tasks.get(taskId);
  }

  async claimNext(agent: AgentName, types?: TaskType[]): Promise<TaskRecord | undefined> {
    const task = await this.repos.tasks.claimNext(agent, types, this.clock.now().toISOString());
    if (task) {
      this.logger.info("task.started", `${agent} started ${task.type}`, { task_id: task.task_id, attempt: task.attempt });
      this.bus.emit("task.started", { task });
    }
    return task;
  }

  async heartbeat(taskId: string): Promise<void> {
    await this.repos.tasks.updateIf(taskId, { status: "RUNNING" }, { heartbeat_at: this.clock.now().toISOString() });
  }

  /**
   * Marks a task completed. Guarded by `attempt` so a run that the Watchdog already
   * reclaimed (timed out) cannot overwrite the newer state.
   */
  async complete(task: TaskRecord, output: Record<string, unknown>): Promise<boolean> {
    const ok = await this.repos.tasks.updateIf(
      task.task_id,
      { status: "RUNNING", attempt: task.attempt },
      { status: "COMPLETED", output, completed_at: this.clock.now().toISOString(), error: null, error_code: null },
    );
    if (!ok) {
      this.logger.warn("task.stale_completion", "Ignored completion of a task that is no longer owned by this run", {
        task_id: task.task_id,
        attempt: task.attempt,
      });
      return false;
    }
    const updated = (await this.repos.tasks.get(task.task_id))!;
    this.logger.info("task.completed", `${task.agent} completed ${task.type}`, { task_id: task.task_id });
    this.bus.emit("task.completed", { task: updated });
    return true;
  }

  /** Records a failure and decides RETRYING vs FAILED. Returns the resulting status. */
  async fail(task: TaskRecord, err: unknown, opts: FailOptions = {}): Promise<TaskStatus | null> {
    const current = await this.repos.tasks.get(task.task_id);
    if (!current || current.status !== "RUNNING" || current.attempt !== task.attempt) {
      this.logger.warn("task.stale_failure", "Ignored failure of a task that is no longer owned by this run", { task_id: task.task_id });
      return null;
    }
    const message = errorMessage(err);
    const code = opts.code ?? (err instanceof AppError ? err.code : "ERROR");
    const retryable = opts.retryable ?? isRetryable(err);
    const canRetry = retryable && current.retry_count < current.max_retries;
    const now = this.clock.now();
    if (canRetry) {
      const retryCount = current.retry_count + 1;
      const delay = backoffDelay(retryCount, this.defaults.retryBaseDelayMs);
      await this.repos.tasks.update(task.task_id, {
        status: "RETRYING",
        retry_count: retryCount,
        error: message,
        error_code: code,
        next_run_at: new Date(now.getTime() + delay).toISOString(),
      });
      const updated = (await this.repos.tasks.get(task.task_id))!;
      this.logger.warn("task.retrying", `${task.type} failed, retry ${retryCount}/${current.max_retries} in ${delay}ms`, {
        task_id: task.task_id,
        error: message,
        code,
      });
      this.bus.emit("task.retrying", { task: updated, error: message });
      return "RETRYING";
    }
    await this.repos.tasks.update(task.task_id, {
      status: "FAILED",
      error: message,
      error_code: code,
      completed_at: now.toISOString(),
    });
    const updated = (await this.repos.tasks.get(task.task_id))!;
    this.logger.error("task.failed", `${task.type} FAILED (${retryable ? "max retries exceeded" : "non-retryable"})`, {
      task_id: task.task_id,
      error: message,
      code,
      retry_count: current.retry_count,
    });
    this.bus.emit("task.failed", { task: updated, error: message });
    return "FAILED";
  }

  /** Re-opens a COMPLETED task whose deliverable turned out to be missing. */
  async reopenForMissingArtifact(task: TaskRecord, reason: string): Promise<TaskStatus> {
    const canRetry = task.retry_count < task.max_retries;
    const now = this.clock.now();
    const status: TaskStatus = canRetry ? "RETRYING" : "FAILED";
    const ok = await this.repos.tasks.updateIf(
      task.task_id,
      { status: "COMPLETED" },
      {
        status,
        retry_count: canRetry ? task.retry_count + 1 : task.retry_count,
        error: reason,
        error_code: "ARTIFACT_MISSING",
        next_run_at: now.toISOString(),
        completed_at: canRetry ? null : now.toISOString(),
      },
    );
    if (!ok) return task.status;
    const updated = (await this.repos.tasks.get(task.task_id))!;
    if (status === "FAILED") this.bus.emit("task.failed", { task: updated, error: reason });
    else this.bus.emit("task.retrying", { task: updated, error: reason });
    return status;
  }

  /** Called by approval flow: WAITING_APPROVAL -> PENDING. */
  async release(taskId: string): Promise<boolean> {
    return this.repos.tasks.updateIf(
      taskId,
      { status: "WAITING_APPROVAL" },
      { status: "PENDING", next_run_at: this.clock.now().toISOString() },
    );
  }

  async cancel(taskId: string, reason: string): Promise<boolean> {
    const task = await this.repos.tasks.get(taskId);
    if (!task || !ACTIVE_TASK_STATUSES.includes(task.status)) return false;
    const ok = await this.repos.tasks.updateIf(taskId, { status: task.status }, {
      status: "CANCELLED",
      error: reason,
      completed_at: this.clock.now().toISOString(),
    });
    if (ok) {
      this.logger.info("task.cancelled", `Cancelled ${task.type}: ${reason}`, { task_id: taskId });
      this.bus.emit("task.cancelled", { task: (await this.repos.tasks.get(taskId))! });
    }
    return ok;
  }

  /** Manual (human-initiated) retry of a FAILED task. Resets the retry budget. */
  async manualRetry(taskId: string): Promise<boolean> {
    const ok = await this.repos.tasks.updateIf(
      taskId,
      { status: "FAILED" },
      { status: "PENDING", retry_count: 0, error: null, error_code: null, completed_at: null, next_run_at: this.clock.now().toISOString() },
    );
    if (ok) this.logger.info("task.manual_retry", "Task re-queued manually", { task_id: taskId });
    return ok;
  }

  async activeTasksForPipeline(pipelineId: string): Promise<TaskRecord[]> {
    return this.repos.tasks.list({ where: { pipeline_id: pipelineId, status: ACTIVE_TASK_STATUSES } });
  }

  async counts(): Promise<Record<TaskStatus, number>> {
    const rows = await this.repos.db.all<{ status: TaskStatus; n: number }>("SELECT status, COUNT(*) AS n FROM tasks GROUP BY status");
    const out = { PENDING: 0, RUNNING: 0, WAITING_APPROVAL: 0, COMPLETED: 0, FAILED: 0, RETRYING: 0, CANCELLED: 0 };
    for (const r of rows) out[r.status] = Number(r.n);
    return out;
  }
}
