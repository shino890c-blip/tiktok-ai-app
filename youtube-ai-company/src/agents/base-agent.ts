import { TimeoutError } from "../core/errors.js";
import { withTimeout } from "../core/retry.js";
import type { AgentName, TaskRecord, TaskType } from "../database/types.js";
import type { Logger } from "../logging/logger.js";
import type { AgentContext } from "./context.js";

export interface ExecutionContext {
  log: Logger;
  signal: AbortSignal;
  /** Throws if the run was aborted (timeout / shutdown). Call between expensive steps. */
  checkpoint(): void;
}

/**
 * Common agent runtime: heartbeat while working, hard timeout, structured logs.
 * Concrete agents implement `execute` and return a JSON-serializable output that
 * references their deliverables (ids + file paths) so the Supervisor can verify them.
 */
export abstract class BaseAgent {
  abstract readonly name: AgentName;
  abstract readonly handles: TaskType[];

  constructor(protected readonly ctx: AgentContext) {}

  protected abstract execute(task: TaskRecord, exec: ExecutionContext): Promise<Record<string, unknown>>;

  protected describe(task: TaskRecord): string {
    return `${task.type} (${task.task_id})`;
  }

  async run(task: TaskRecord): Promise<Record<string, unknown>> {
    const { config, state, tasks, logger } = this.ctx;
    const log = logger.child({ agent: this.name, task_id: task.task_id });
    const controller = new AbortController();
    const timeoutMs = config.pipeline.agentTimeoutMinutes * 60_000;

    await state.heartbeat(this.name, { status: "running", taskId: task.task_id, currentTask: this.describe(task) });
    const beat = setInterval(() => {
      void Promise.all([state.heartbeat(this.name), tasks.heartbeat(task.task_id)]).catch((err: unknown) =>
        log.warn("agent.heartbeat_failed", "Heartbeat update failed", { error: String(err) }),
      );
    }, Math.max(100, config.pipeline.heartbeatIntervalSeconds * 1000));
    beat.unref();

    const exec: ExecutionContext = {
      log,
      signal: controller.signal,
      checkpoint: () => {
        if (controller.signal.aborted) throw new TimeoutError(`${this.name} run aborted`, { task_id: task.task_id });
      },
    };

    log.info("agent.run_start", `${this.name} picked up ${task.type}`, { attempt: task.attempt, retry_count: task.retry_count });
    const started = Date.now();
    try {
      const output = await withTimeout(this.execute(task, exec), timeoutMs, () => {
        controller.abort();
        return new TimeoutError(`${this.name} exceeded AGENT_TIMEOUT_MINUTES (${config.pipeline.agentTimeoutMinutes}m)`);
      });
      log.info("agent.run_done", `${this.name} finished ${task.type}`, { duration_ms: Date.now() - started });
      return output;
    } catch (err) {
      log.error("agent.run_error", `${this.name} failed ${task.type}: ${String((err as Error).message ?? err)}`, {
        duration_ms: Date.now() - started,
      });
      await state.setStatus(this.name, "error", { last_error: String((err as Error).message ?? err) }).catch(() => undefined);
      throw err;
    } finally {
      clearInterval(beat);
      const current = await state.get(this.name).catch(() => undefined);
      await state
        .heartbeat(this.name, { status: current?.status === "error" ? "error" : "idle", taskId: null, currentTask: null })
        .catch(() => undefined);
    }
  }
}
