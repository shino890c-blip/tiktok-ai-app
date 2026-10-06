import type { Clock } from "../clock.js";
import type { EventBus } from "../event-bus/index.js";
import type { Repositories } from "../../database/repositories.js";
import type { AgentName, AgentRecord, AgentStatus } from "../../database/types.js";

export const AGENT_ROLES: Record<AgentName, string> = {
  researcher: "YouTube Researcher — 市場調査のプロ",
  scriptwriter: "Script Writer — 視聴維持率を意識した脚本家",
  publisher: "Publisher / Quality Controller — 品質管理責任者",
  analyst: "Analytics & Growth Strategist — データ分析・成長戦略責任者",
  supervisor: "Supervisor / Orchestrator — AI会社のオペレーション責任者",
};

/** Tracks agent status + heartbeat in the `agents` table. */
export class StateManager {
  constructor(
    private readonly repos: Repositories,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async registerAll(): Promise<void> {
    for (const name of Object.keys(AGENT_ROLES) as AgentName[]) {
      const existing = await this.repos.agents.get(name);
      if (!existing) {
        await this.repos.agents.insert({
          name,
          role: AGENT_ROLES[name],
          status: "idle",
          last_heartbeat: this.clock.now().toISOString(),
          current_task: null,
          task_id: null,
          restart_count: 0,
          last_error: null,
        });
      } else if (existing.status === "running" || existing.status === "stalled") {
        // A previous process died mid-task; the Watchdog will reconcile the orphaned task.
        await this.repos.agents.update(name, { status: "idle", current_task: null, task_id: null });
      }
    }
  }

  async heartbeat(agent: AgentName, update: { status?: AgentStatus; taskId?: string | null; currentTask?: string | null } = {}): Promise<void> {
    await this.repos.agents.update(agent, {
      last_heartbeat: this.clock.now().toISOString(),
      ...(update.status ? { status: update.status } : {}),
      ...(update.taskId !== undefined ? { task_id: update.taskId } : {}),
      ...(update.currentTask !== undefined ? { current_task: update.currentTask } : {}),
    });
    this.bus.emit("agent.heartbeat", { agent, taskId: update.taskId ?? null });
  }

  async setStatus(agent: AgentName, status: AgentStatus, extra: Partial<AgentRecord> = {}): Promise<void> {
    await this.repos.agents.update(agent, { status, ...extra });
  }

  async markRestarted(agent: AgentName, reason: string): Promise<void> {
    const rec = await this.repos.agents.get(agent);
    await this.repos.agents.update(agent, {
      status: "idle",
      task_id: null,
      current_task: null,
      last_error: reason,
      restart_count: (rec?.restart_count ?? 0) + 1,
      last_heartbeat: this.clock.now().toISOString(),
    });
  }

  async all(): Promise<AgentRecord[]> {
    return this.repos.agents.list({ orderBy: "name ASC" });
  }

  async get(agent: AgentName): Promise<AgentRecord | undefined> {
    return this.repos.agents.get(agent);
  }
}
