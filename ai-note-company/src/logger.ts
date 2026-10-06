import fs from "node:fs";
import path from "node:path";

type Level = "debug" | "info" | "warn" | "error";

/** Never log these keys' values. */
const SECRET_KEYS = /pass(word)?|secret|token|api[_-]?key|cookie|authorization/i;

function redact(meta: unknown): unknown {
  if (meta === null || typeof meta !== "object") return meta;
  if (Array.isArray(meta)) return meta.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? "[REDACTED]" : redact(v);
  }
  return out;
}

export class Logger {
  private static logDir: string | null = null;
  private static quiet = process.env.AI_NOTE_QUIET === "1";

  static configure(logDir: string, opts: { quiet?: boolean } = {}): void {
    Logger.logDir = logDir;
    if (opts.quiet !== undefined) Logger.quiet = opts.quiet;
    fs.mkdirSync(logDir, { recursive: true });
  }

  constructor(private readonly scope: string) {}

  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`);
  }

  private write(level: Level, msg: string, meta?: unknown): void {
    const entry = { ts: new Date().toISOString(), level, scope: this.scope, msg, ...(meta ? { meta: redact(meta) } : {}) };
    if (!Logger.quiet || level === "error") {
      const line = `[${entry.ts}] ${level.toUpperCase().padEnd(5)} ${this.scope}: ${msg}`;
      if (level === "error") console.error(line, meta ? JSON.stringify(entry.meta) : "");
      else if (level !== "debug") console.log(line);
    }
    if (Logger.logDir) {
      try {
        fs.appendFileSync(path.join(Logger.logDir, "app.log"), JSON.stringify(entry) + "\n");
      } catch {
        /* logging must never crash the app */
      }
    }
  }

  debug(msg: string, meta?: unknown) { this.write("debug", msg, meta); }
  info(msg: string, meta?: unknown) { this.write("info", msg, meta); }
  warn(msg: string, meta?: unknown) { this.write("warn", msg, meta); }
  error(msg: string, meta?: unknown) { this.write("error", msg, meta); }
}

export const rootLogger = new Logger("ai-note");
