import type { BaseAgent } from "../agents/base-agent.js";
import type { TaskType } from "../database/types.js";
import type { Logger } from "../logging/logger.js";
import type { NotificationService } from "../notifications/index.js";
import { DatabaseError, errorMessage } from "./errors.js";
import type { EventBus } from "./event-bus/index.js";
import type { TaskManager } from "./task-manager/index.js";

/**
 * Pulls tasks from the queue and runs them on the owning agent. One task per agent
 * at a time; different agents run in parallel. A DatabaseError halts the worker
 * (state can no longer be trusted) and raises a CRITICAL notification.
 */
export class Worker {
  private busy = new Set<string>();
  private halted = false;
  private inflight = new Set<Promise<unknown>>();

  constructor(
    private readonly agents: BaseAgent[],
    private readonly deps: { tasks: TaskManager; bus: EventBus; logger: Logger; notifier: NotificationService },
  ) {}

  get isHalted(): boolean {
    return this.halted;
  }

  /** Claims and runs at most one task for the agent. Returns true if a task was processed. */
  async processOne(agent: BaseAgent, types?: TaskType[]): Promise<boolean> {
    if (this.halted || this.busy.has(agent.name)) return false;
    this.busy.add(agent.name);
    try {
      const handles = types ? agent.handles.filter((h) => types.includes(h)) : agent.handles;
      if (!handles.length) return false;
      const task = await this.deps.tasks.claimNext(agent.name, handles);
      if (!task) return false;
      try {
        const output = await agent.run(task);
        await this.deps.tasks.complete(task, output);
      } catch (err) {
        if (err instanceof DatabaseError) throw err;
        await this.deps.tasks.fail(task, err);
      }
      return true;
    } catch (err) {
      if (err instanceof DatabaseError) await this.halt(err);
      else this.deps.logger.error("worker.error", `Unexpected worker error: ${errorMessage(err)}`, { agent: agent.name });
      return false;
    } finally {
      this.busy.delete(agent.name);
    }
  }

  /** Non-blocking poll used by the long-running service: starts work for every idle agent. */
  poll(): void {
    for (const agent of this.agents) {
      if (this.busy.has(agent.name)) continue;
      const p = this.processOne(agent);
      this.inflight.add(p);
      void p.finally(() => this.inflight.delete(p));
    }
  }

  /**
   * Processes until no runnable task remains (used by CLI one-shots and the E2E test).
   * Bounded by maxRounds so it can never loop forever.
   */
  async runUntilIdle(opts: { agents?: string[]; types?: TaskType[]; maxRounds?: number } = {}): Promise<number> {
    const agents = opts.agents ? this.agents.filter((a) => opts.agents!.includes(a.name)) : this.agents;
    const maxRounds = opts.maxRounds ?? 200;
    let processed = 0;
    for (let round = 0; round < maxRounds && !this.halted; round++) {
      const results = await Promise.all(agents.map((a) => this.processOne(a, opts.types)));
      await this.deps.bus.drain();
      const n = results.filter(Boolean).length;
      processed += n;
      if (n === 0) return processed;
    }
    if (!this.halted) this.deps.logger.warn("worker.max_rounds", `runUntilIdle stopped after ${maxRounds} rounds (safety limit)`);
    return processed;
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.inflight]);
  }

  private async halt(err: unknown): Promise<void> {
    if (this.halted) return;
    this.halted = true;
    this.deps.logger.critical("worker.halted", `Processing stopped: ${errorMessage(err)}`);
    await this.deps.notifier.notify({
      level: "CRITICAL",
      title: "データベースエラーにより処理を停止しました",
      agent: "worker",
      error: errorMessage(err),
      retry: "なし（安全のため停止）",
      action: "DBファイル/ディスク容量/権限を確認し、プロセスを再起動してください",
    });
    this.deps.bus.emit("system.halt", { reason: errorMessage(err) });
  }
}
