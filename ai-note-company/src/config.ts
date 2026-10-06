import fs from "node:fs";
import path from "node:path";

export type RunMode = "mock" | "live";
export type ArticleMode = "FREE" | "PAID" | "DRAFT" | "PARTIAL_PAID";
export type LlmProviderName = "mock" | "anthropic" | "openai";

export interface ScheduleConfig {
  mode: "daily" | "immediate";
  research: string;
  strategy: string;
  writing: string;
  quality: string;
  draft: string;
  analyticsDelayHours: number;
}

export interface AppConfig {
  rootDir: string;
  runMode: RunMode;
  llm: { provider: LlmProviderName; model: string; apiKey: string };
  note: {
    autoPublish: boolean;
    headless: boolean;
    baseUrl: string;
    storageStatePath: string;
    loginTimeoutMinutes: number;
    publisher: "mock" | "playwright";
  };
  dailyArticleLimit: number;
  defaultArticleMode: ArticleMode;
  defaultArticlePrice: number;
  qualityThreshold: number;
  maxRevisions: number;
  heartbeatIntervalSeconds: number;
  agentTimeoutMinutes: number;
  maxRetries: number;
  supervisorTickSeconds: number;
  schedule: ScheduleConfig;
  notification: { provider: "console" | "discord" | "slack"; webhookUrl: string };
  image: { provider: "placeholder" | "openai"; apiKey: string };
  research: { youtubeApiKey: string; fetchRss: boolean; noteBrowse: boolean };
  dashboard: { port: number; host: string };
  databasePath: string;
  dataDir: string;
  logDir: string;
}

let envLoaded = false;

/** Loads ./.env once (no dependency on dotenv). Existing process.env values win. */
export function loadEnvFile(rootDir: string): void {
  if (envLoaded) return;
  envLoaded = true;
  const file = path.join(rootDir, ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function str(env: NodeJS.ProcessEnv, key: string, def: string): string {
  const v = env[key];
  return v === undefined || v === "" ? def : v;
}
function num(env: NodeJS.ProcessEnv, key: string, def: number): number {
  const v = env[key];
  if (v === undefined || v === "") return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${key}: ${v}`);
  return n;
}
function bool(env: NodeJS.ProcessEnv, key: string, def: boolean): boolean {
  const v = env[key];
  if (v === undefined || v === "") return def;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}
function oneOf<T extends string>(value: string, allowed: readonly T[], key: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`Invalid value for ${key}: "${value}" (allowed: ${allowed.join(", ")})`);
  }
  return value as T;
}

export function projectRoot(): string {
  // src/config.ts or dist/config.js → project root is one level up.
  return path.resolve(__dirname, "..");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, rootDir = projectRoot()): AppConfig {
  if (env === process.env) loadEnvFile(rootDir);
  const runMode = oneOf(str(env, "RUN_MODE", "mock"), ["mock", "live"] as const, "RUN_MODE");
  const resolve = (p: string) => (path.isAbsolute(p) ? p : path.resolve(rootDir, p));

  const llmProvider = oneOf(
    str(env, "LLM_PROVIDER", runMode === "mock" ? "mock" : "anthropic"),
    ["mock", "anthropic", "openai"] as const,
    "LLM_PROVIDER",
  );
  const defaultModel = llmProvider === "anthropic" ? "claude-opus-5-5" : llmProvider === "openai" ? "gpt-4.1" : "mock";

  return {
    rootDir,
    runMode,
    llm: { provider: llmProvider, model: str(env, "LLM_MODEL", defaultModel), apiKey: str(env, "LLM_API_KEY", "") },
    note: {
      autoPublish: bool(env, "NOTE_AUTO_PUBLISH", false),
      headless: bool(env, "BROWSER_HEADLESS", false),
      baseUrl: str(env, "NOTE_BASE_URL", "https://note.com").replace(/\/$/, ""),
      storageStatePath: resolve(str(env, "NOTE_STORAGE_STATE", "./.auth/note-storage.json")),
      loginTimeoutMinutes: num(env, "NOTE_LOGIN_TIMEOUT_MINUTES", 10),
      publisher: runMode === "mock" ? "mock" : "playwright",
    },
    dailyArticleLimit: num(env, "DAILY_ARTICLE_LIMIT", 1),
    defaultArticleMode: oneOf(
      str(env, "DEFAULT_ARTICLE_MODE", "FREE"),
      ["FREE", "PAID", "DRAFT", "PARTIAL_PAID"] as const,
      "DEFAULT_ARTICLE_MODE",
    ),
    defaultArticlePrice: num(env, "DEFAULT_ARTICLE_PRICE", 980),
    qualityThreshold: num(env, "QUALITY_THRESHOLD", 80),
    maxRevisions: num(env, "MAX_REVISIONS", 2),
    heartbeatIntervalSeconds: num(env, "HEARTBEAT_INTERVAL_SECONDS", 60),
    agentTimeoutMinutes: num(env, "AGENT_TIMEOUT_MINUTES", 30),
    maxRetries: num(env, "MAX_RETRIES", 3),
    supervisorTickSeconds: num(env, "SUPERVISOR_TICK_SECONDS", 60),
    schedule: {
      mode: oneOf(str(env, "SCHEDULE_MODE", "daily"), ["daily", "immediate"] as const, "SCHEDULE_MODE"),
      research: str(env, "SCHEDULE_RESEARCH", "08:00"),
      strategy: str(env, "SCHEDULE_STRATEGY", "09:00"),
      writing: str(env, "SCHEDULE_WRITING", "10:00"),
      quality: str(env, "SCHEDULE_QUALITY", "11:00"),
      draft: str(env, "SCHEDULE_DRAFT", "11:30"),
      analyticsDelayHours: num(env, "ANALYTICS_DELAY_HOURS", 24),
    },
    notification: {
      provider: oneOf(str(env, "NOTIFICATION_PROVIDER", "console"), ["console", "discord", "slack"] as const, "NOTIFICATION_PROVIDER"),
      webhookUrl: str(env, "NOTIFICATION_WEBHOOK_URL", ""),
    },
    image: {
      provider: oneOf(str(env, "IMAGE_PROVIDER", "placeholder"), ["placeholder", "openai"] as const, "IMAGE_PROVIDER"),
      apiKey: str(env, "IMAGE_API_KEY", ""),
    },
    research: {
      youtubeApiKey: str(env, "YOUTUBE_API_KEY", ""),
      fetchRss: bool(env, "RESEARCH_FETCH_RSS", runMode === "live"),
      noteBrowse: bool(env, "RESEARCH_NOTE_BROWSE", false),
    },
    dashboard: { port: num(env, "DASHBOARD_PORT", 3939), host: str(env, "DASHBOARD_HOST", "127.0.0.1") },
    databasePath: resolve(str(env, "DATABASE_PATH", "./data/ai-note-company.db")),
    dataDir: resolve(str(env, "DATA_DIR", "./data")),
    logDir: resolve(str(env, "LOG_DIR", "./logs")),
  };
}
