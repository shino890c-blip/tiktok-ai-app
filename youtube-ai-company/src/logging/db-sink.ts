import { newId } from "../core/ids.js";
import type { Repositories } from "../database/repositories.js";
import type { LogRecord, LogSink } from "./logger.js";
import { LOG_LEVEL_ORDER } from "./logger.js";

/** Persists log records (INFO and above) into system_events so the dashboard/Supervisor can trace agent activity. */
export class DatabaseEventSink implements LogSink {
  private disabled = false;
  constructor(
    private readonly repos: Repositories,
    private readonly minLevel: keyof typeof LOG_LEVEL_ORDER = "INFO",
  ) {}

  write(r: LogRecord): void {
    if (this.disabled || LOG_LEVEL_ORDER[r.level] < LOG_LEVEL_ORDER[this.minLevel]) return;
    void this.repos.events
      .insert({
        event_id: newId("evt"),
        level: r.level,
        agent: r.agent,
        task_id: r.task_id,
        event: r.event,
        message: r.message,
        metadata: r.metadata,
        created_at: r.timestamp,
        updated_at: r.timestamp,
      })
      .catch((err: unknown) => {
        process.stderr.write(`[logger] failed to persist event: ${String(err)}\n`);
      });
  }

  disable(): void {
    this.disabled = true;
  }
}
