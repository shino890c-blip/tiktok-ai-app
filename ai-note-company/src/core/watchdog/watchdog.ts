import type { AppConfig } from "../../config";
import type { Repository } from "../../database/repositories";
import type { NotificationService } from "../../notifications/notificationService";
import type { AgentName } from "../../types";
import type { EventBus } from "../events/eventBus";
import type { AgentRunner } from "../runner";
import type { TaskManager } from "../tasks/taskManager";
import type { HeartbeatRegistry } from "./heartbeat";

export interface WatchdogAction {
  agent: AgentName;
  task_id: string | null;
  reason: string;
  task_status_before: string | null;
  last_error: string | null;
  recent_events: string[];
  outcome: "retrying" | "failed" | "agent_restarted";
}

/**
 * WATCHDOG: detects agents whose heartbeat stopped (hung/crashed) and tasks
 * stuck in RUNNING. Recovery is bounded by MAX_RETRIES — never infinite.
 *
 * 1. Task状態確認 2. ログ確認 3. エラー確認 4. Retry 5. Agent再起動
 * 6. 失敗ならFAILED 7. Supervisorへ報告 8. 人間へ通知
 */
export class Watchdog {
  constructor(
    private readonly config: AppConfig,
    private readonly repo: Repository,
    private readonly tasks: TaskManager,
    private readonly heartbeats: HeartbeatRegistry,
    private readonly runner: AgentRunner,
    private readonly notifier: NotificationService,
    private readonly events: EventBus,
  ) {}

  private get timeoutMs(): number {
    return this.config.agentTimeoutMinutes * 60_000;
  }

  async check(now: Date = new Date()): Promise<WatchdogAction[]> {
    const actions: WatchdogAction[] = [];
    const handled = new Set<string>();

    for (const hb of this.heartbeats.all()) {
      if (hb.status !== "running" || !hb.task_id) continue; // supervisor's own tick beat has no task
      const age = now.getTime() - new Date(hb.last_heartbeat).getTime();
      if (age <= this.timeoutMs) continue;
      const action = await this.recover(hb.agent, hb.task_id, `heartbeat timeout (${Math.round(age / 1000)}s > ${this.config.agentTimeoutMinutes}min)`);
      actions.push(action);
      if (hb.task_id) handled.add(hb.task_id);
    }

    // RUNNING tasks nobody is working on (e.g. the process crashed mid-task).
    for (const t of this.tasks.list({ status: "RUNNING" })) {
      if (handled.has(t.task_id) || this.runner.isActive(t.task_id)) continue;
      const started = t.started_at ? new Date(t.started_at).getTime() : 0;
      const hb = this.heartbeats.get(t.agent);
      const hbFresh = hb && hb.task_id === t.task_id && now.getTime() - new Date(hb.last_heartbeat).getTime() <= this.timeoutMs;
      if (hbFresh || now.getTime() - started <= this.timeoutMs) continue;
      actions.push(await this.recover(t.agent, t.task_id, "orphaned RUNNING task (no live agent)"));
    }
    return actions;
  }

  /** Startup recovery: tasks left RUNNING by a previous process are not running anymore. */
  async recoverAfterRestart(): Promise<WatchdogAction[]> {
    const out: WatchdogAction[] = [];
    for (const t of this.tasks.list({ status: "RUNNING" })) {
      if (this.runner.isActive(t.task_id)) continue;
      out.push(await this.recover(t.agent, t.task_id, "process restarted while task was RUNNING"));
    }
    return out;
  }

  private async recover(agent: AgentName, taskId: string | null, reason: string): Promise<WatchdogAction> {
    // 1. Task state  2. logs  3. error
    const task = taskId ? this.tasks.get(taskId) : undefined;
    const recent = taskId ? this.repo.listEvents({ limit: 200 }).filter((e) => e.task_id === taskId).slice(0, 5).map((e) => `${e.level}:${e.type}:${e.message}`) : [];
    const lastError = task?.error ?? this.heartbeats.get(agent)?.last_error ?? null;

    let outcome: WatchdogAction["outcome"] = "agent_restarted";
    if (task && task.status === "RUNNING") {
      this.runner.abortTask(task.task_id, "watchdog");
      // 4. Retry (bounded) / 6. FAILED
      const { willRetry, task: after } = this.tasks.fail(task.task_id, `watchdog: ${reason}${lastError ? ` / last error: ${lastError}` : ""}`);
      outcome = willRetry ? "retrying" : "failed";
      if (!willRetry) {
        // 7. report to supervisor  8. notify human
        this.events.system("error", "watchdog.failed", `${agent} ${task.type} FAILED after ${after.retry_count} retries: ${reason}`, { agent, task_id: task.task_id, data: { recent } });
        await this.notifier.notify({ type: "ERROR", agent, task: `${task.type} (${task.task_id})`, error: `Watchdog: ${reason}`, retry: `${after.retry_count}/${this.tasks.maxRetries} → FAILED` });
      } else {
        this.events.system("warn", "watchdog.retry", `${agent} ${task.type} → RETRYING (${after.retry_count}/${this.tasks.maxRetries}): ${reason}`, { agent, task_id: task.task_id });
      }
    }
    // 5. Agent restart
    this.heartbeats.markRestarted(agent);
    this.runner.restartAgent(agent);
    if (outcome === "agent_restarted") this.events.system("warn", "watchdog.restart", `${agent}: ${reason}`, { agent, task_id: taskId });

    return { agent, task_id: taskId, reason, task_status_before: task?.status ?? null, last_error: lastError, recent_events: recent, outcome };
  }
}
