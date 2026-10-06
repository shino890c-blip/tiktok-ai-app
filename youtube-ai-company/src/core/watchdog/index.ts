import type { AppConfig } from "../../config/index.js";
import type { Repositories } from "../../database/repositories.js";
import type { AgentName, TaskRecord } from "../../database/types.js";
import type { Logger } from "../../logging/logger.js";
import type { NotificationService } from "../../notifications/index.js";
import type { Clock } from "../clock.js";
import { TimeoutError } from "../errors.js";
import type { EventBus } from "../event-bus/index.js";
import type { StateManager } from "../state-manager/index.js";
import type { TaskManager } from "../task-manager/index.js";

export interface WatchdogFinding {
  agent: AgentName | null;
  taskId: string | null;
  reason: "heartbeat_lost" | "timeout" | "agent_stalled";
  staleForMs: number;
  recentErrors: string[];
  outcome: "retrying" | "failed" | "agent_restarted" | "ignored";
}

/**
 * Independent watchdog. Periodically checks agent heartbeats and running tasks:
 *   1. confirm task state  2. read recent logs  3. collect errors
 *   4. safely re-queue (bounded by MAX_RETRIES)  5/6. FAILED when exhausted
 *   7. alert Supervisor (event)  8. notify humans
 */
export class Watchdog {
  constructor(
    private readonly deps: {
      config: AppConfig;
      repos: Repositories;
      tasks: TaskManager;
      state: StateManager;
      bus: EventBus;
      notifier: NotificationService;
      clock: Clock;
      logger: Logger;
    },
  ) {}

  private get thresholds() {
    const p = this.deps.config.pipeline;
    return {
      heartbeatStaleMs: p.heartbeatIntervalSeconds * p.heartbeatMissTolerance * 1000,
      timeoutMs: p.agentTimeoutMinutes * 60_000,
    };
  }

  async check(): Promise<WatchdogFinding[]> {
    const { repos, clock, logger } = this.deps;
    const log = logger.child({ agent: "watchdog" });
    const now = clock.now().getTime();
    const { heartbeatStaleMs, timeoutMs } = this.thresholds;
    const findings: WatchdogFinding[] = [];

    const running = await repos.tasks.list({ where: { status: "RUNNING" } });
    for (const task of running) {
      const lastBeat = new Date(task.heartbeat_at ?? task.started_at ?? task.updated_at).getTime();
      const startedAt = new Date(task.started_at ?? task.updated_at).getTime();
      let reason: WatchdogFinding["reason"] | null = null;
      if (now - lastBeat > heartbeatStaleMs) reason = "heartbeat_lost";
      else if (now - startedAt > timeoutMs) reason = "timeout";
      if (!reason) continue;
      findings.push(await this.recover(task, reason, reason === "timeout" ? now - startedAt : now - lastBeat));
    }

    // Agents that claim to be running but have no live task and no heartbeat.
    const runningTaskAgents = new Set((await repos.tasks.list({ where: { status: "RUNNING" } })).map((t) => t.agent));
    for (const agent of await repos.agents.list()) {
      if (agent.status !== "running" || runningTaskAgents.has(agent.name)) continue;
      const staleFor = now - new Date(agent.last_heartbeat ?? agent.updated_at).getTime();
      if (staleFor <= heartbeatStaleMs) continue;
      await this.deps.state.markRestarted(agent.name, `heartbeat lost for ${Math.round(staleFor / 1000)}s`);
      log.warn("watchdog.agent_restarted", `${agent.name} had no heartbeat for ${Math.round(staleFor / 1000)}s; reset to idle`);
      this.deps.bus.emit("watchdog.alert", { agent: agent.name, taskId: null, reason: "agent_stalled", action: "agent restarted" });
      findings.push({ agent: agent.name, taskId: null, reason: "agent_stalled", staleForMs: staleFor, recentErrors: [], outcome: "agent_restarted" });
    }

    if (findings.length) log.warn("watchdog.findings", `Watchdog handled ${findings.length} issue(s)`, { findings });
    else log.debug("watchdog.ok", "All agents healthy");
    return findings;
  }

  private async recover(task: TaskRecord, reason: "heartbeat_lost" | "timeout", staleForMs: number): Promise<WatchdogFinding> {
    const { repos, tasks, state, bus, notifier, logger } = this.deps;
    const log = logger.child({ agent: "watchdog", task_id: task.task_id });

    // 1. confirm state hasn't changed since we looked
    const fresh = await repos.tasks.get(task.task_id);
    if (!fresh || fresh.status !== "RUNNING" || fresh.attempt !== task.attempt) {
      return { agent: task.agent, taskId: task.task_id, reason, staleForMs, recentErrors: [], outcome: "ignored" };
    }
    // 2./3. logs + errors for context
    const events = await repos.events.list({ where: { task_id: task.task_id }, limit: 20 });
    const recentErrors = events.filter((e) => e.level === "ERROR" || e.level === "CRITICAL").map((e) => e.message).slice(0, 5);
    const agentRec = await repos.agents.get(task.agent);
    if (agentRec?.last_error) recentErrors.push(`agent last_error: ${agentRec.last_error}`);

    log.warn("watchdog.detected", `${task.agent} ${reason} on ${task.type} (${Math.round(staleForMs / 1000)}s)`, { recent_errors: recentErrors });

    // 4.-6. safe re-run or FAILED (TaskManager enforces MAX_RETRIES)
    const err = new TimeoutError(`Watchdog: ${reason} after ${Math.round(staleForMs / 1000)}s`, { reason });
    const result = await tasks.fail(fresh, err, { code: reason === "timeout" ? "TIMEOUT" : "HEARTBEAT_LOST" });
    await state.markRestarted(task.agent, err.message);

    // 7. tell the Supervisor  8. tell humans
    const outcome: WatchdogFinding["outcome"] = result === "RETRYING" ? "retrying" : result === "FAILED" ? "failed" : "ignored";
    bus.emit("watchdog.alert", {
      agent: task.agent,
      taskId: task.task_id,
      reason,
      action: outcome === "retrying" ? "re-queued with backoff" : outcome === "failed" ? "marked FAILED" : "no-op",
    });
    if (outcome === "retrying") {
      await notifier.notify({
        level: "WARN",
        title: `Watchdog: ${task.agent} の応答なし（${reason}）`,
        agent: task.agent,
        taskId: task.task_id,
        error: err.message,
        retry: `${fresh.retry_count + 1}/${fresh.max_retries}`,
        action: "Agentを再起動し、タスクを安全に再実行します",
      });
    }
    // FAILED notifications are sent by the Supervisor's task.failed handler (CRITICAL format).
    return { agent: task.agent, taskId: task.task_id, reason, staleForMs, recentErrors, outcome };
  }
}
