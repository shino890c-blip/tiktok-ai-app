import type { SqlDatabase } from "./connection.js";

/**
 * Ordered migrations. SQL is kept portable (TEXT/INTEGER/REAL, JSON stored as TEXT)
 * so it can be ported to PostgreSQL (JSON -> JSONB) with minimal changes.
 */
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "initial_schema",
    sql: `
CREATE TABLE IF NOT EXISTS agents (
  name TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  last_heartbeat TEXT,
  current_task TEXT,
  task_id TEXT,
  restart_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pipelines (
  pipeline_id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  research_id TEXT,
  idea_id TEXT,
  script_id TEXT,
  video_id TEXT,
  analytics_id TEXT,
  experiment_id TEXT,
  revision_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  agent TEXT NOT NULL,
  status TEXT NOT NULL,
  pipeline_id TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  input TEXT NOT NULL DEFAULT '{}',
  output TEXT,
  error TEXT,
  error_code TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  attempt INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  heartbeat_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, agent, next_run_at);
CREATE INDEX IF NOT EXISTS idx_tasks_pipeline ON tasks(pipeline_id);

CREATE TABLE IF NOT EXISTS research (
  research_id TEXT PRIMARY KEY,
  pipeline_id TEXT,
  task_id TEXT,
  query TEXT NOT NULL,
  market_summary TEXT NOT NULL,
  findings TEXT NOT NULL,
  source_urls TEXT NOT NULL DEFAULT '[]',
  is_mock INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ideas (
  idea_id TEXT PRIMARY KEY,
  research_id TEXT NOT NULL REFERENCES research(research_id),
  pipeline_id TEXT,
  topic TEXT NOT NULL,
  hook TEXT NOT NULL,
  trend_reason TEXT NOT NULL,
  why_worth_making TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  recommended_duration INTEGER NOT NULL,
  structure TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  source_urls TEXT NOT NULL DEFAULT '[]',
  experiment_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scripts (
  script_id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(idea_id),
  pipeline_id TEXT,
  task_id TEXT,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  qc_report TEXT,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  video_id TEXT PRIMARY KEY,
  pipeline_id TEXT,
  script_id TEXT NOT NULL REFERENCES scripts(script_id),
  idea_id TEXT,
  experiment_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  privacy_status TEXT NOT NULL,
  video_file_path TEXT,
  youtube_video_id TEXT,
  youtube_url TEXT,
  status TEXT NOT NULL,
  is_mock INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics (
  analytics_id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(video_id),
  youtube_video_id TEXT NOT NULL,
  metrics TEXT NOT NULL,
  unavailable_metrics TEXT NOT NULL DEFAULT '[]',
  performance_score REAL NOT NULL,
  report TEXT NOT NULL,
  is_mock INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  feedback_id TEXT PRIMARY KEY,
  video_id TEXT,
  analytics_id TEXT,
  source_agent TEXT NOT NULL,
  target_agent TEXT NOT NULL,
  content TEXT NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0,
  file_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_events (
  event_id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  agent TEXT,
  task_id TEXT,
  event TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_created ON system_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_task ON system_events(task_id);

CREATE TABLE IF NOT EXISTS approvals (
  approval_id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(video_id),
  pipeline_id TEXT,
  status TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge (
  knowledge_id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  polarity TEXT NOT NULL,
  content TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '{}',
  video_id TEXT,
  experiment_id TEXT,
  score REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category, polarity);

CREATE TABLE IF NOT EXISTS experiments (
  experiment_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  variant TEXT NOT NULL,
  metric TEXT NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  conclusion TEXT,
  video_ids TEXT NOT NULL DEFAULT '[]',
  min_samples INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_usage (
  usage_key TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
  },
];

export async function migrate(db: SqlDatabase, nowIso: string): Promise<number[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (await db.all<{ version: number }>("SELECT version FROM schema_migrations")).map((r) => Number(r.version)),
  );
  const newlyApplied: number[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    await db.transaction(async () => {
      await db.exec(m.sql);
      await db.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", [
        m.version,
        m.name,
        nowIso,
      ]);
    });
    newlyApplied.push(m.version);
  }
  return newlyApplied;
}
