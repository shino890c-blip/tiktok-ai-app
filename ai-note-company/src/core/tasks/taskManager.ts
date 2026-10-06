import type { Db } from "../../database/db";
import { fromJson, toJson } from "../../database/db";
import type { AgentName, Task, TaskStatus, TaskType } from "../../types";
import { newId, nowIso } from "../../utils";
import type { EventBus } from "../events/eventBus";

/** Allowed state transitions. Anything else is a bug and throws. */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  PENDING: ["RUNNING", "CANCELLED", "WAITING_APPROVAL"],
  RETRYING: ["RUNNING", "CANCELLED", "FAILED"],
  RUNNING: ["COMPLETED", "FAILED", "RETRYING", "WAITING_APPROVAL", "CANCELLED"],
  WAITING_APPROVAL: ["COMPLETED", "CANCELLED", "FAILED"],
  COMPLETED: [],
  FAILED: ["PENDING"], // manual re-queue only (resetForManualRetry)
  CANCELLED: [],
};

export interface CreateTaskInput {
  agent: AgentName;
  type: TaskType;
  input: Record<string, unknown>;
  pipelineId?: string | null;
  scheduledAt?: Date | null;
}

export interface TaskManagerOptions {
  maxRetries: number;
  /** Base backoff in seconds; actual = base * 2^(retry-1). */
  retryBackoffSeconds?: number;
}

type Row = Record<string, unknown>;

function rowToTask(r: Row): Task {
  return {
    task_id: String(r.task_id),
    pipeline_id: (r.pipeline_id as string) ?? null,
    agent: r.agent as AgentName,
    type: r.type as TaskType,
    status: r.status as TaskStatus,
    created_at: String(r.created_at),
    started_at: (r.started_at as string) ?? null,
    completed_at: (r.completed_at as string) ?? null,
    scheduled_at: (r.scheduled_at as string) ?? null,
    retry_count: Number(r.retry_count),
    input: fromJson<Record<string, unknown>>(r.input, {}),
    output: fromJson<Record<string, unknown> | null>(r.output, null),
    error: (r.error as string) ?? null,
  };
}

export class TaskManager {
  private readonly backoff: number;

  constructor(
    private readonly db: Db,
    private readonly opts: TaskManagerOptions,
    private readonly events?: EventBus,
  ) {
    this.backoff = opts.retryBackoffSeconds ?? 30;
  }

  get maxRetries(): number {
    return this.opts.maxRetries;
  }

  create(input: CreateTaskInput): Task {
    const task: Task = {
      task_id: newId("task"),
      pipeline_id: input.pipelineId ?? null,
      agent: input.agent,
      type: input.type,
      status: "PENDING",
      created_at: nowIso(),
      started_at: null,
      completed_at: null,
      scheduled_at: input.scheduledAt ? input.scheduledAt.toISOString() : null,
      retry_count: 0,
      input: input.input,
      output: null,
      error: null,
    };
    this.db.run(
      `INSERT INTO tasks (task_id, pipeline_id, agent, type, status, created_at, scheduled_at, retry_count, input)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [task.task_id, task.pipeline_id, task.agent, task.type, task.status, task.created_at, task.scheduled_at, 0, toJson(task.input)],
    );
    this.events?.emit("task", { task_id: task.task_id, status: task.status, type: task.type });
    return task;
  }

  get(taskId: string): Task | undefined {
    const r = this.db.get<Row>("SELECT * FROM tasks WHERE task_id = ?", [taskId]);
    return r ? rowToTask(r) : undefined;
  }

  require(taskId: string): Task {
    const t = this.get(taskId);
    if (!t) throw new Error(`Task not found: ${taskId}`);
    return t;
  }

  list(filter: { status?: TaskStatus | TaskStatus[]; type?: TaskType; pipelineId?: string; limit?: number } = {}): Task[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.status) {
      const s = Array.isArray(filter.status) ? filter.status : [filter.status];
      where.push(`status IN (${s.map(() => "?").join(",")})`);
      params.push(...s);
    }
    if (filter.type) {
      where.push("type = ?");
      params.push(filter.type);
    }
    if (filter.pipelineId) {
      where.push("pipeline_id = ?");
      params.push(filter.pipelineId);
    }
    const sql = `SELECT * FROM tasks ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at ASC, rowid ASC LIMIT ?`;
    params.push(filter.limit ?? 500);
    return this.db.all<Row>(sql, params).map(rowToTask);
  }

  /** PENDING/RETRYING tasks whose scheduled time has arrived. */
  runnable(now: Date = new Date()): Task[] {
    return this.db
      .all<Row>(
        `SELECT * FROM tasks WHERE status IN ('PENDING','RETRYING') AND (scheduled_at IS NULL OR scheduled_at <= ?)
         ORDER BY created_at ASC, rowid ASC`,
        [now.toISOString()],
      )
      .map(rowToTask);
  }

  private transition(taskId: string, to: TaskStatus, fields: Record<string, string | number | null> = {}): Task {
    return this.db.transaction(() => {
      const task = this.require(taskId);
      if (!TRANSITIONS[task.status].includes(to)) {
        throw new Error(`Invalid task transition ${task.status} → ${to} (${taskId})`);
      }
      const sets = ["status = ?", ...Object.keys(fields).map((k) => `${k} = ?`)];
      this.db.run(`UPDATE tasks SET ${sets.join(", ")} WHERE task_id = ?`, [to, ...Object.values(fields), taskId]);
      const updated = this.require(taskId);
      this.events?.emit("task", { task_id: taskId, status: to, type: updated.type });
      return updated;
    });
  }

  start(taskId: string): Task {
    return this.transition(taskId, "RUNNING", { started_at: nowIso(), error: null });
  }

  complete(taskId: string, output: Record<string, unknown>): Task {
    return this.transition(taskId, "COMPLETED", { completed_at: nowIso(), output: toJson(output) });
  }

  waitApproval(taskId: string, output: Record<string, unknown>): Task {
    return this.transition(taskId, "WAITING_APPROVAL", { output: toJson(output) });
  }

  cancel(taskId: string, reason: string): Task {
    return this.transition(taskId, "CANCELLED", { completed_at: nowIso(), error: reason });
  }

  /**
   * Records a failure. Retries (RETRYING with exponential backoff) until
   * retry_count reaches maxRetries, then FAILED. Never retries forever.
   */
  fail(taskId: string, error: string, opts: { retryable?: boolean } = {}): { task: Task; willRetry: boolean } {
    const task = this.require(taskId);
    const retryable = opts.retryable ?? true;
    const nextCount = task.retry_count + 1;
    if (retryable && nextCount <= this.opts.maxRetries && (task.status === "RUNNING" || task.status === "RETRYING")) {
      const delayMs = this.backoff * 1000 * 2 ** (nextCount - 1);
      const updated = this.transition(taskId, "RETRYING", {
        retry_count: nextCount,
        error,
        scheduled_at: new Date(Date.now() + delayMs).toISOString(),
      });
      return { task: updated, willRetry: true };
    }
    const updated = this.transition(taskId, "FAILED", { completed_at: nowIso(), error, retry_count: retryable ? nextCount - 1 : task.retry_count });
    return { task: updated, willRetry: false };
  }

  /** Human-triggered re-queue of a FAILED task (dashboard/CLI). Resets retry budget. */
  resetForManualRetry(taskId: string): Task {
    return this.transition(taskId, "PENDING", { retry_count: 0, error: null, started_at: null, completed_at: null, scheduled_at: null });
  }

  countCreatedOn(type: TaskType, dateKey: string, excludeStatuses: TaskStatus[] = ["CANCELLED"]): number {
    // created_at is UTC ISO; compare in local time via JS for portability.
    const rows = this.db.all<Row>("SELECT created_at, status FROM tasks WHERE type = ?", [type]);
    return rows.filter((r) => {
      if (excludeStatuses.includes(r.status as TaskStatus)) return false;
      const d = new Date(String(r.created_at));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return key === dateKey;
    }).length;
  }

  counts(): Record<TaskStatus, number> {
    const out = { PENDING: 0, RUNNING: 0, WAITING_APPROVAL: 0, COMPLETED: 0, FAILED: 0, RETRYING: 0, CANCELLED: 0 } as Record<TaskStatus, number>;
    for (const r of this.db.all<Row>("SELECT status, COUNT(*) n FROM tasks GROUP BY status")) out[r.status as TaskStatus] = Number(r.n);
    return out;
  }
}
