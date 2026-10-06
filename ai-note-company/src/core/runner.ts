import type { Agent } from "../agents/base";
import { NonRetryableError } from "../agents/base";
import type { AppConfig } from "../config";
import { LlmError } from "../llm/provider";
import type { Logger } from "../logger";
import { AuthRequiredError } from "../note/auth/auth";
import { SelectorNotFoundError } from "../note/browser/resolve";
import { PublishUnverifiedError } from "../note/publisher/types";
import type { NotificationService } from "../notifications/notificationService";
import type { AgentName, Task } from "../types";
import { errorMessage } from "../utils";
import type { EventBus } from "./events/eventBus";
import type { Pipeline } from "./pipeline";
import type { TaskManager } from "./tasks/taskManager";
import type { HeartbeatRegistry } from "./watchdog/heartbeat";

export function isRetryable(e: unknown): boolean {
  if (e instanceof NonRetryableError || e instanceof SelectorNotFoundError || e instanceof AuthRequiredError || e instanceof PublishUnverifiedError) return false;
  if (e instanceof LlmError) return e.retryable;
  return true;
}

export interface RunnerDeps {
  config: AppConfig;
  tasks: TaskManager;
  heartbeats: HeartbeatRegistry;
  pipeline: Pipeline;
  notifier: NotificationService;
  events: EventBus;
  logger: Logger;
}

/**
 * Executes tasks on agents with heartbeats. Agents are created by factories so
 * the watchdog can "restart" a hung agent (fresh instance, old run aborted).
 */
export class AgentRunner {
  private readonly agents = new Map<AgentName, Agent>();
  private readonly active = new Map<string, AbortController>();

  constructor(private readonly deps: RunnerDeps, private readonly factories: Partial<Record<AgentName, () => Agent>>) {
    for (const [name, f] of Object.entries(factories)) this.agents.set(name as AgentName, f!());
  }

  agentNames(): AgentName[] {
    return [...this.agents.keys()];
  }

  restartAgent(name: AgentName): void {
    const f = this.factories[name];
    if (f) this.agents.set(name, f());
    this.deps.events.system("warn", "agent.restarted", `agent ${name} restarted`, { agent: name });
  }

  abortTask(taskId: string, reason: string): boolean {
    const c = this.active.get(taskId);
    if (!c) return false;
    c.abort(reason);
    return true;
  }

  isActive(taskId: string): boolean {
    return this.active.has(taskId);
  }

  async run(task: Task): Promise<Task> {
    const { tasks, heartbeats, events, logger, config, pipeline, notifier } = this.deps;
    const agent = this.agents.get(task.agent);
    if (!agent) {
      tasks.start(task.task_id);
      return tasks.fail(task.task_id, `no agent registered for ${task.agent}`, { retryable: false }).task;
    }

    tasks.start(task.task_id);
    heartbeats.beat(task.agent, "running", task.task_id);
    const timer = setInterval(() => heartbeats.beat(task.agent, "running", task.task_id), config.heartbeatIntervalSeconds * 1000);
    timer.unref();
    const controller = new AbortController();
    this.active.set(task.task_id, controller);
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error(`aborted: ${String(controller.signal.reason)}`))));
    aborted.catch(() => undefined);

    const log = logger.child(task.agent);
    log.info(`▶ ${task.type} ${task.task_id}${task.retry_count ? ` (retry ${task.retry_count})` : ""}`);
    try {
      const result = await Promise.race([agent.handle(task, controller.signal), aborted]);
      const current = tasks.require(task.task_id);
      if (current.status !== "RUNNING") {
        log.warn(`late result ignored for ${task.task_id} (now ${current.status})`);
        return current;
      }
      let done: Task;
      if (result.kind === "completed") {
        done = tasks.complete(task.task_id, result.output);
        heartbeats.beat(task.agent, "idle", null, null);
        log.info(`✔ ${task.type} ${task.task_id}`);
        await pipeline.onTaskFinished(done, result.output);
      } else if (result.kind === "waiting_approval") {
        done = tasks.waitApproval(task.task_id, result.output);
        heartbeats.beat(task.agent, "idle", null, null);
      } else {
        done = tasks.cancel(task.task_id, result.reason);
        heartbeats.beat(task.agent, "idle", null, null);
        events.system("warn", "task.cancelled", `${task.type}: ${result.reason}`, { agent: task.agent, task_id: task.task_id });
      }
      return done;
    } catch (e) {
      const msg = errorMessage(e);
      const current = tasks.require(task.task_id);
      if (current.status !== "RUNNING") return current; // watchdog already handled it
      const retryable = isRetryable(e);
      const { task: failed, willRetry } = tasks.fail(task.task_id, msg, { retryable });
      heartbeats.beat(task.agent, "error", null, msg);
      events.system(willRetry ? "warn" : "error", willRetry ? "task.retrying" : "task.failed", `${task.type}: ${msg}`, { agent: task.agent, task_id: task.task_id });
      log.error(`✖ ${task.type} ${task.task_id}: ${msg}`);
      if (!willRetry) {
        await notifier.notify({
          type: "ERROR",
          agent: task.agent,
          task: `${task.type} (${task.task_id})`,
          error: msg,
          retry: retryable ? `${failed.retry_count}/${tasks.maxRetries} 回で上限到達 → FAILED` : "リトライ不可（人間の確認が必要）→ FAILED",
        });
      }
      return failed;
    } finally {
      clearInterval(timer);
      this.active.delete(task.task_id);
    }
  }
}
