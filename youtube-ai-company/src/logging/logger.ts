import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Clock } from "../core/clock.js";
import { systemClock } from "../core/clock.js";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";

export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  CRITICAL: 50,
};

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  agent: string | null;
  task_id: string | null;
  event: string;
  message: string;
  metadata: Record<string, unknown>;
}

export interface LogSink {
  write(record: LogRecord): void;
}

export interface LogContext {
  agent?: string;
  task_id?: string;
}

export interface Logger {
  debug(event: string, message: string, metadata?: Record<string, unknown>): void;
  info(event: string, message: string, metadata?: Record<string, unknown>): void;
  warn(event: string, message: string, metadata?: Record<string, unknown>): void;
  error(event: string, message: string, metadata?: Record<string, unknown>): void;
  critical(event: string, message: string, metadata?: Record<string, unknown>): void;
  child(ctx: LogContext): Logger;
  addSink(sink: LogSink): void;
}

const COLORS: Record<LogLevel, string> = {
  DEBUG: "\x1b[90m",
  INFO: "\x1b[36m",
  WARN: "\x1b[33m",
  ERROR: "\x1b[31m",
  CRITICAL: "\x1b[41m\x1b[97m",
};

export class ConsoleSink implements LogSink {
  constructor(private readonly opts: { json?: boolean; color?: boolean } = {}) {}
  write(r: LogRecord): void {
    const stream = LOG_LEVEL_ORDER[r.level] >= LOG_LEVEL_ORDER.ERROR ? process.stderr : process.stdout;
    if (this.opts.json) {
      stream.write(JSON.stringify(r) + "\n");
      return;
    }
    const color = this.opts.color ?? stream.isTTY;
    const lvl = color ? `${COLORS[r.level]}${r.level.padEnd(8)}\x1b[0m` : r.level.padEnd(8);
    const who = r.agent ? `[${r.agent}]` : "[system]";
    const task = r.task_id ? ` task=${r.task_id}` : "";
    const meta = Object.keys(r.metadata).length ? ` ${JSON.stringify(r.metadata)}` : "";
    stream.write(`${r.timestamp} ${lvl} ${who} ${r.event}${task} — ${r.message}${meta}\n`);
  }
}

/** JSON Lines file sink: logs/app-YYYY-MM-DD.log */
export class FileSink implements LogSink {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  write(r: LogRecord): void {
    const file = path.join(this.dir, `app-${r.timestamp.slice(0, 10)}.log`);
    try {
      appendFileSync(file, JSON.stringify(r) + "\n");
    } catch (err) {
      process.stderr.write(`[logger] failed to write log file ${file}: ${String(err)}\n`);
    }
  }
}

/** In-memory sink, mainly for tests and the dashboard's recent-log view. */
export class MemorySink implements LogSink {
  readonly records: LogRecord[] = [];
  constructor(private readonly max = 1000) {}
  write(r: LogRecord): void {
    this.records.push(r);
    if (this.records.length > this.max) this.records.shift();
  }
}

class StructuredLogger implements Logger {
  constructor(
    private readonly shared: { sinks: LogSink[]; minLevel: LogLevel; clock: Clock },
    private readonly ctx: LogContext = {},
  ) {}

  private log(level: LogLevel, event: string, message: string, metadata: Record<string, unknown> = {}): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.shared.minLevel]) return;
    const { task_id, agent, ...rest } = metadata as Record<string, unknown> & LogContext;
    const record: LogRecord = {
      timestamp: this.shared.clock.now().toISOString(),
      level,
      agent: (agent as string | undefined) ?? this.ctx.agent ?? null,
      task_id: (task_id as string | undefined) ?? this.ctx.task_id ?? null,
      event,
      message,
      metadata: rest,
    };
    for (const sink of this.shared.sinks) {
      try {
        sink.write(record);
      } catch (err) {
        process.stderr.write(`[logger] sink failure: ${String(err)}\n`);
      }
    }
  }

  debug(e: string, m: string, md?: Record<string, unknown>) { this.log("DEBUG", e, m, md); }
  info(e: string, m: string, md?: Record<string, unknown>) { this.log("INFO", e, m, md); }
  warn(e: string, m: string, md?: Record<string, unknown>) { this.log("WARN", e, m, md); }
  error(e: string, m: string, md?: Record<string, unknown>) { this.log("ERROR", e, m, md); }
  critical(e: string, m: string, md?: Record<string, unknown>) { this.log("CRITICAL", e, m, md); }

  child(ctx: LogContext): Logger {
    return new StructuredLogger(this.shared, { ...this.ctx, ...ctx });
  }

  addSink(sink: LogSink): void {
    this.shared.sinks.push(sink);
  }
}

export function createLogger(opts: { minLevel?: LogLevel; sinks?: LogSink[]; clock?: Clock } = {}): Logger {
  return new StructuredLogger({
    sinks: opts.sinks ?? [new ConsoleSink()],
    minLevel: opts.minLevel ?? "INFO",
    clock: opts.clock ?? systemClock,
  });
}

/** Wraps a sink with its own minimum level (e.g. quiet console + verbose file). */
export class LevelFilterSink implements LogSink {
  constructor(
    private readonly inner: LogSink,
    private readonly minLevel: LogLevel,
  ) {}
  write(r: LogRecord): void {
    if (LOG_LEVEL_ORDER[r.level] >= LOG_LEVEL_ORDER[this.minLevel]) this.inner.write(r);
  }
}
