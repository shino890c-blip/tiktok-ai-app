/**
 * Schema written in portable SQL (TEXT / INTEGER / REAL, ISO-8601 timestamps,
 * JSON stored as TEXT) so it maps 1:1 onto PostgreSQL (TEXT→TEXT/JSONB,
 * INTEGER→BIGINT, REAL→DOUBLE PRECISION).
 */
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE agents (
  agent TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  task_id TEXT,
  last_heartbeat TEXT NOT NULL,
  restarts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY,
  pipeline_id TEXT,
  agent TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  scheduled_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  input TEXT NOT NULL,
  output TEXT,
  error TEXT
);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_pipeline ON tasks(pipeline_id);

CREATE TABLE ideas (
  idea_id TEXT PRIMARY KEY,
  pipeline_id TEXT,
  topic TEXT NOT NULL,
  data TEXT NOT NULL,
  selected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE strategies (
  strategy_id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(idea_id),
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE articles (
  article_id TEXT PRIMARY KEY,
  pipeline_id TEXT,
  strategy_id TEXT NOT NULL REFERENCES strategies(strategy_id),
  idea_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  quality_score REAL,
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  file_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE quality_reports (
  report_id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(article_id),
  revision INTEGER NOT NULL,
  score REAL NOT NULL,
  passed INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE drafts (
  draft_id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(article_id),
  status TEXT NOT NULL,
  note_url TEXT,
  edit_url TEXT,
  is_mock INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE published_articles (
  published_id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(article_id),
  status TEXT NOT NULL,
  note_url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  is_mock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE analytics (
  analytics_id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(article_id),
  performance_score REAL NOT NULL,
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  sales INTEGER,
  revenue INTEGER,
  follower_growth INTEGER,
  is_simulated INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  collected_at TEXT NOT NULL
);

CREATE TABLE feedback (
  feedback_id TEXT PRIMARY KEY,
  article_id TEXT,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE knowledge (
  knowledge_id TEXT PRIMARY KEY,
  article_id TEXT,
  kind TEXT NOT NULL,
  topic TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE approvals (
  approval_id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(article_id),
  draft_id TEXT,
  status TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE system_events (
  event_id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  type TEXT NOT NULL,
  agent TEXT,
  task_id TEXT,
  message TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_events_created ON system_events(created_at);
`,
  },
];

export const TABLES = [
  "agents",
  "tasks",
  "ideas",
  "strategies",
  "articles",
  "drafts",
  "published_articles",
  "analytics",
  "feedback",
  "knowledge",
  "approvals",
  "system_events",
] as const;
