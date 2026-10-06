import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./schema";

export type SqlValue = string | number | null;

/**
 * Minimal DB adapter. Repositories only talk to this interface using portable
 * SQL with `?` placeholders, so a PostgreSQL adapter (pg + `$n` rewriting) can
 * be dropped in later without touching agents.
 */
export interface Db {
  run(sql: string, params?: SqlValue[]): { changes: number };
  get<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): T[];
  transaction<T>(fn: () => T): T;
  close(): void;
}

// node:sqlite prints an ExperimentalWarning on first load; silence only that one.
function loadSqlite(): typeof import("node:sqlite") {
  const original = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === "string" ? warning : warning.message;
    if (/SQLite is an experimental feature/.test(text)) return;
    return (original as (...a: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:sqlite");
  } finally {
    process.emitWarning = original;
  }
}

export class SqliteDb implements Db {
  private readonly db: import("node:sqlite").DatabaseSync;
  private depth = 0;

  constructor(filePath: string) {
    const { DatabaseSync } = loadSqlite();
    if (filePath !== ":memory:") fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
  }

  run(sql: string, params: SqlValue[] = []) {
    const r = this.db.prepare(sql).run(...params);
    return { changes: Number(r.changes) };
  }
  get<T>(sql: string, params: SqlValue[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  all<T>(sql: string, params: SqlValue[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.depth++;
    this.db.exec("BEGIN");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally {
      this.depth--;
    }
  }
  exec(sql: string) {
    this.db.exec(sql);
  }
  close() {
    this.db.close();
  }
}

export function openDatabase(filePath: string): Db {
  const db = new SqliteDb(filePath);
  migrate(db);
  return db;
}

export function migrate(db: SqliteDb): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set(db.all<{ version: number }>("SELECT version FROM schema_migrations").map((r) => r.version));
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.run("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [m.version, new Date().toISOString()]);
    });
  }
}

export function toJson(v: unknown): string {
  return JSON.stringify(v ?? null);
}
export function fromJson<T>(v: unknown, fallback: T): T {
  if (typeof v !== "string") return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}
