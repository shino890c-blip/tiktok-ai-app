import { EventEmitter } from "node:events";
import type { Repository } from "../../database/repositories";

export interface EventMap {
  task: { task_id: string; status: string; type: string };
  heartbeat: { agent: string; status: string; task_id: string | null };
  system: { level: "info" | "warn" | "error"; type: string; message: string; agent?: string | null; task_id?: string | null; data?: unknown };
}

/** In-process event bus. System events are also persisted to system_events. */
export class EventBus {
  private readonly emitter = new EventEmitter();
  constructor(private readonly repo?: Repository) {
    this.emitter.setMaxListeners(50);
  }

  emit<K extends keyof EventMap>(name: K, payload: EventMap[K]): void {
    if (name === "system" && this.repo) {
      const p = payload as EventMap["system"];
      this.repo.addEvent({ level: p.level, type: p.type, message: p.message, agent: p.agent ?? null, task_id: p.task_id ?? null, data: p.data });
    }
    this.emitter.emit(name, payload);
  }

  on<K extends keyof EventMap>(name: K, fn: (payload: EventMap[K]) => void): () => void {
    this.emitter.on(name, fn);
    return () => this.emitter.off(name, fn);
  }

  system(level: "info" | "warn" | "error", type: string, message: string, extra: Omit<EventMap["system"], "level" | "type" | "message"> = {}): void {
    this.emit("system", { level, type, message, ...extra });
  }
}
