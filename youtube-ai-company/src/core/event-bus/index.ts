import { EventEmitter } from "node:events";
import type { AgentName, TaskRecord } from "../../database/types.js";

/** Typed in-process event bus used for Agent -> Supervisor signalling. */
export interface CompanyEvents {
  "task.created": { task: TaskRecord };
  "task.started": { task: TaskRecord };
  "task.completed": { task: TaskRecord };
  "task.retrying": { task: TaskRecord; error: string };
  "task.failed": { task: TaskRecord; error: string };
  "task.cancelled": { task: TaskRecord };
  "agent.heartbeat": { agent: AgentName; taskId: string | null };
  "watchdog.alert": { agent: AgentName | null; taskId: string | null; reason: string; action: string };
  "approval.requested": { approvalId: string; videoId: string };
  "approval.decided": { approvalId: string; videoId: string; approved: boolean };
  "video.published": { videoId: string; youtubeVideoId: string };
  "system.halt": { reason: string };
}

type Handler<K extends keyof CompanyEvents> = (payload: CompanyEvents[K]) => void | Promise<void>;

export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly pending = new Set<Promise<unknown>>();

  constructor(private readonly onHandlerError: (event: string, err: unknown) => void = () => undefined) {
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof CompanyEvents>(event: K, handler: Handler<K>): () => void {
    const wrapped = (payload: CompanyEvents[K]) => {
      try {
        const r = handler(payload);
        if (r instanceof Promise) {
          const p = r.catch((err) => this.onHandlerError(event, err));
          this.pending.add(p);
          void p.finally(() => this.pending.delete(p));
        }
      } catch (err) {
        this.onHandlerError(event, err);
      }
    };
    this.emitter.on(event, wrapped);
    return () => this.emitter.off(event, wrapped);
  }

  emit<K extends keyof CompanyEvents>(event: K, payload: CompanyEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  /** Waits for async handlers triggered so far (used by tests and runUntilIdle). */
  async drain(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}
