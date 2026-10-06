import type { Db } from "../../database/db";
import type { AgentName, Heartbeat } from "../../types";
import { nowIso } from "../../utils";

type Row = Record<string, unknown>;

/** Stores agent heartbeats in the `agents` table. */
export class HeartbeatRegistry {
  constructor(private readonly db: Db) {}

  beat(agent: AgentName, status: Heartbeat["status"], taskId: string | null, lastError?: string | null): void {
    const now = nowIso();
    const existing = this.db.get<Row>("SELECT agent FROM agents WHERE agent = ?", [agent]);
    if (existing) {
      if (lastError !== undefined) {
        this.db.run("UPDATE agents SET status=?, task_id=?, last_heartbeat=?, last_error=? WHERE agent=?", [status, taskId, now, lastError, agent]);
      } else {
        this.db.run("UPDATE agents SET status=?, task_id=?, last_heartbeat=? WHERE agent=?", [status, taskId, now, agent]);
      }
    } else {
      this.db.run("INSERT INTO agents (agent, status, task_id, last_heartbeat, restarts, last_error) VALUES (?,?,?,?,0,?)", [
        agent,
        status,
        taskId,
        now,
        lastError ?? null,
      ]);
    }
  }

  /** Test/maintenance helper: force the heartbeat timestamp. */
  setLastHeartbeat(agent: AgentName, iso: string): void {
    this.db.run("UPDATE agents SET last_heartbeat = ? WHERE agent = ?", [iso, agent]);
  }

  markRestarted(agent: AgentName): void {
    this.db.run("UPDATE agents SET restarts = restarts + 1, status = 'idle', task_id = NULL, last_heartbeat = ? WHERE agent = ?", [nowIso(), agent]);
  }

  get(agent: AgentName): (Heartbeat & { last_error: string | null }) | undefined {
    const r = this.db.get<Row>("SELECT * FROM agents WHERE agent = ?", [agent]);
    return r ? toHb(r) : undefined;
  }

  all(): (Heartbeat & { last_error: string | null })[] {
    return this.db.all<Row>("SELECT * FROM agents ORDER BY agent").map(toHb);
  }
}

function toHb(r: Row): Heartbeat & { last_error: string | null } {
  return {
    agent: r.agent as AgentName,
    status: r.status as Heartbeat["status"],
    task_id: (r.task_id as string) ?? null,
    last_heartbeat: String(r.last_heartbeat),
    restarts: Number(r.restarts),
    last_error: (r.last_error as string) ?? null,
  };
}
