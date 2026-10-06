import type { Clock } from "../core/clock.js";
import type { SqlDatabase, SqlParams, SqlValue } from "./connection.js";
import type {
  AgentRecord,
  AnalyticsRecord,
  ApprovalRecord,
  ExperimentRecord,
  FeedbackRecord,
  IdeaRecord,
  KnowledgeRecord,
  PipelineRecord,
  ResearchRecord,
  ScriptRecord,
  SystemEventRecord,
  TaskRecord,
  VideoRecord,
} from "./types.js";

type Where<T> = Partial<{ [K in keyof T]: T[K] | T[K][] }>;

export interface ListOptions<T> {
  where?: Where<T>;
  orderBy?: string;
  limit?: number;
  offset?: number;
}

function toSql(value: unknown, isJson: boolean): SqlValue {
  if (value === undefined || value === null) return null;
  if (isJson) return JSON.stringify(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Generic table repository. Handles created_at/updated_at and JSON columns.
 * Column names are taken from code only (never user input), values are always bound.
 */
export class TableRepo<T extends { created_at: string; updated_at: string }> {
  constructor(
    protected readonly db: SqlDatabase,
    protected readonly clock: Clock,
    readonly table: string,
    readonly pk: keyof T & string,
    private readonly jsonColumns: readonly (keyof T & string)[] = [],
  ) {}

  protected fromRow(row: Record<string, unknown> | undefined): T | undefined {
    if (!row) return undefined;
    const out: Record<string, unknown> = { ...row };
    for (const col of this.jsonColumns) {
      const v = out[col];
      if (typeof v === "string") {
        try {
          out[col] = JSON.parse(v);
        } catch {
          out[col] = null;
        }
      }
    }
    return out as T;
  }

  protected whereClause(where: Where<T> = {}): { sql: string; params: SqlParams } {
    const parts: string[] = [];
    const params: SqlParams = [];
    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        if (value.length === 0) {
          parts.push("1 = 0");
          continue;
        }
        parts.push(`${key} IN (${value.map(() => "?").join(", ")})`);
        params.push(...value.map((v) => toSql(v, false)));
      } else if (value === null) {
        parts.push(`${key} IS NULL`);
      } else {
        parts.push(`${key} = ?`);
        params.push(toSql(value, false));
      }
    }
    return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
  }

  async insert(record: Omit<T, "created_at" | "updated_at"> & Partial<Pick<T, "created_at" | "updated_at">>): Promise<T> {
    const now = this.clock.now().toISOString();
    const full = { created_at: now, updated_at: now, ...record } as Record<string, unknown>;
    const cols = Object.keys(full);
    const values = cols.map((c) => toSql(full[c], (this.jsonColumns as readonly string[]).includes(c)));
    await this.db.run(
      `INSERT INTO ${this.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      values,
    );
    return full as T;
  }

  async update(id: string, patch: Partial<T>): Promise<number> {
    const full: Record<string, unknown> = { ...patch, updated_at: this.clock.now().toISOString() };
    delete full[this.pk];
    delete full.created_at;
    const cols = Object.keys(full).filter((c) => full[c] !== undefined);
    const values = cols.map((c) => toSql(full[c], (this.jsonColumns as readonly string[]).includes(c)));
    const r = await this.db.run(
      `UPDATE ${this.table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE ${this.pk} = ?`,
      [...values, id],
    );
    return r.changes;
  }

  /** Conditional update — only applies when the current row matches `expected`. Returns true if applied. */
  async updateIf(id: string, expected: Where<T>, patch: Partial<T>): Promise<boolean> {
    const full: Record<string, unknown> = { ...patch, updated_at: this.clock.now().toISOString() };
    delete full[this.pk];
    const cols = Object.keys(full).filter((c) => full[c] !== undefined);
    const values = cols.map((c) => toSql(full[c], (this.jsonColumns as readonly string[]).includes(c)));
    const where = this.whereClause(expected);
    const cond = where.sql ? `AND ${where.sql.slice("WHERE ".length)}` : "";
    const r = await this.db.run(
      `UPDATE ${this.table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE ${this.pk} = ? ${cond}`,
      [...values, id, ...where.params],
    );
    return r.changes > 0;
  }

  async get(id: string): Promise<T | undefined> {
    return this.fromRow(await this.db.get(`SELECT * FROM ${this.table} WHERE ${this.pk} = ?`, [id]));
  }

  async findOne(where: Where<T>, orderBy = "created_at DESC"): Promise<T | undefined> {
    const w = this.whereClause(where);
    return this.fromRow(await this.db.get(`SELECT * FROM ${this.table} ${w.sql} ORDER BY ${orderBy} LIMIT 1`, w.params));
  }

  async list(opts: ListOptions<T> = {}): Promise<T[]> {
    const w = this.whereClause(opts.where);
    const limit = opts.limit !== undefined ? `LIMIT ${Math.max(0, Math.floor(opts.limit))}` : "";
    const offset = opts.offset !== undefined ? `OFFSET ${Math.max(0, Math.floor(opts.offset))}` : "";
    const rows = await this.db.all<Record<string, unknown>>(
      `SELECT * FROM ${this.table} ${w.sql} ORDER BY ${opts.orderBy ?? "created_at DESC"} ${limit} ${offset}`,
      w.params,
    );
    return rows.map((r) => this.fromRow(r) as T);
  }

  async count(where: Where<T> = {}, extraSql = "", extraParams: SqlParams = []): Promise<number> {
    const w = this.whereClause(where);
    const glue = w.sql ? " AND " : "WHERE ";
    const sql = `SELECT COUNT(*) AS n FROM ${this.table} ${w.sql}${extraSql ? glue + extraSql : ""}`;
    const row = await this.db.get<{ n: number }>(sql, [...w.params, ...extraParams]);
    return Number(row?.n ?? 0);
  }

  async query(sqlWhere: string, params: SqlParams = [], orderBy = "created_at DESC", limit?: number): Promise<T[]> {
    const rows = await this.db.all<Record<string, unknown>>(
      `SELECT * FROM ${this.table} WHERE ${sqlWhere} ORDER BY ${orderBy}${limit ? ` LIMIT ${limit}` : ""}`,
      params,
    );
    return rows.map((r) => this.fromRow(r) as T);
  }
}

export class TaskRepo extends TableRepo<TaskRecord> {
  /**
   * Atomically claims the next runnable task for an agent (PENDING or RETRYING whose
   * next_run_at has passed). Single UPDATE ... RETURNING, so two workers can't claim the same task.
   */
  async claimNext(agent: string, types: string[] | undefined, nowIso: string): Promise<TaskRecord | undefined> {
    const typeFilter = types && types.length ? `AND type IN (${types.map(() => "?").join(", ")})` : "";
    const row = await this.db.get<Record<string, unknown>>(
      `UPDATE tasks
         SET status = 'RUNNING', started_at = ?, heartbeat_at = ?, updated_at = ?, attempt = attempt + 1, error = NULL
       WHERE task_id = (
         SELECT task_id FROM tasks
          WHERE agent = ? AND status IN ('PENDING', 'RETRYING')
            AND (next_run_at IS NULL OR next_run_at <= ?) ${typeFilter}
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
       ) AND status IN ('PENDING', 'RETRYING')
       RETURNING *`,
      [nowIso, nowIso, nowIso, agent, nowIso, ...(types ?? [])],
    );
    return this.fromRow(row);
  }
}

export class ApiUsageRepo {
  constructor(
    private readonly db: SqlDatabase,
    private readonly clock: Clock,
  ) {}

  async increment(key: string, by = 1): Promise<number> {
    const now = this.clock.now().toISOString();
    await this.db.run(
      `INSERT INTO api_usage (usage_key, calls, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(usage_key) DO UPDATE SET calls = calls + excluded.calls, updated_at = excluded.updated_at`,
      [key, by, now, now],
    );
    return this.get(key);
  }

  async get(key: string): Promise<number> {
    const row = await this.db.get<{ calls: number }>("SELECT calls FROM api_usage WHERE usage_key = ?", [key]);
    return Number(row?.calls ?? 0);
  }
}

export interface Repositories {
  db: SqlDatabase;
  agents: TableRepo<AgentRecord>;
  tasks: TaskRepo;
  pipelines: TableRepo<PipelineRecord>;
  research: TableRepo<ResearchRecord>;
  ideas: TableRepo<IdeaRecord>;
  scripts: TableRepo<ScriptRecord>;
  videos: TableRepo<VideoRecord>;
  analytics: TableRepo<AnalyticsRecord>;
  feedback: TableRepo<FeedbackRecord>;
  events: TableRepo<SystemEventRecord>;
  approvals: TableRepo<ApprovalRecord>;
  knowledge: TableRepo<KnowledgeRecord>;
  experiments: TableRepo<ExperimentRecord>;
  apiUsage: ApiUsageRepo;
}

export function createRepositories(db: SqlDatabase, clock: Clock): Repositories {
  return {
    db,
    agents: new TableRepo<AgentRecord>(db, clock, "agents", "name"),
    tasks: new TaskRepo(db, clock, "tasks", "task_id", ["input", "output"]),
    pipelines: new TableRepo<PipelineRecord>(db, clock, "pipelines", "pipeline_id"),
    research: new TableRepo<ResearchRecord>(db, clock, "research", "research_id", ["findings", "source_urls"]),
    ideas: new TableRepo<IdeaRecord>(db, clock, "ideas", "idea_id", ["structure", "source_urls"]),
    scripts: new TableRepo<ScriptRecord>(db, clock, "scripts", "script_id", ["content", "qc_report"]),
    videos: new TableRepo<VideoRecord>(db, clock, "videos", "video_id", ["tags"]),
    analytics: new TableRepo<AnalyticsRecord>(db, clock, "analytics", "analytics_id", [
      "metrics",
      "unavailable_metrics",
      "report",
    ]),
    feedback: new TableRepo<FeedbackRecord>(db, clock, "feedback", "feedback_id", ["content"]),
    events: new TableRepo<SystemEventRecord>(db, clock, "system_events", "event_id", ["metadata"]),
    approvals: new TableRepo<ApprovalRecord>(db, clock, "approvals", "approval_id"),
    knowledge: new TableRepo<KnowledgeRecord>(db, clock, "knowledge", "knowledge_id", ["evidence"]),
    experiments: new TableRepo<ExperimentRecord>(db, clock, "experiments", "experiment_id", ["result", "video_ids"]),
    apiUsage: new ApiUsageRepo(db, clock),
  };
}
