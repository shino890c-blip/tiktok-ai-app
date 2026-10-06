import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DatabaseError } from "../core/errors.js";

export type SqlValue = string | number | null;
export type SqlParams = SqlValue[];

/**
 * Minimal async SQL interface. SQLite implements it today; a PostgreSQL adapter
 * (e.g. using `pg`) can implement the same interface later. Repositories only use
 * portable SQL with `?` placeholders (an adapter may rewrite them to $1, $2...).
 */
export interface SqlDatabase {
  readonly dialect: "sqlite" | "postgres";
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParams): Promise<{ changes: number }>;
  get<T = Record<string, unknown>>(sql: string, params?: SqlParams): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, params?: SqlParams): Promise<T[]>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class SqliteDatabase implements SqlDatabase {
  readonly dialect = "sqlite" as const;
  private readonly db: DatabaseSync;
  private txChain: Promise<unknown> = Promise.resolve();

  constructor(file: string) {
    try {
      if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
      this.db = new DatabaseSync(file);
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA foreign_keys = ON;");
      this.db.exec("PRAGMA busy_timeout = 5000;");
    } catch (err) {
      throw new DatabaseError(`Failed to open SQLite database at ${file}`, err);
    }
  }

  private wrap<T>(sql: string, fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      throw new DatabaseError(`SQL failed: ${(err as Error).message} :: ${sql.slice(0, 160)}`, err);
    }
  }

  async exec(sql: string): Promise<void> {
    this.wrap(sql, () => this.db.exec(sql));
  }

  async run(sql: string, params: SqlParams = []): Promise<{ changes: number }> {
    return this.wrap(sql, () => {
      const r = this.db.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    });
  }

  async get<T>(sql: string, params: SqlParams = []): Promise<T | undefined> {
    return this.wrap(sql, () => this.db.prepare(sql).get(...params) as T | undefined);
  }

  async all<T>(sql: string, params: SqlParams = []): Promise<T[]> {
    return this.wrap(sql, () => this.db.prepare(sql).all(...params) as T[]);
  }

  /** Serialized transactions (one at a time) to keep BEGIN/COMMIT pairs from interleaving. */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      await this.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn();
        await this.exec("COMMIT");
        return result;
      } catch (err) {
        try {
          await this.exec("ROLLBACK");
        } catch {
          /* rollback failure is reported by the original error */
        }
        throw err;
      }
    };
    const next = this.txChain.then(run, run);
    this.txChain = next.catch(() => undefined);
    return next;
  }

  async close(): Promise<void> {
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }
}

export function openDatabase(databaseUrl: string): SqlDatabase {
  if (databaseUrl.startsWith("sqlite:")) {
    return new SqliteDatabase(databaseUrl.slice("sqlite:".length));
  }
  throw new DatabaseError(`Unsupported DATABASE_URL: ${databaseUrl}`);
}
