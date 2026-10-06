import { existsSync } from "node:fs";
import path from "node:path";
import { ConfigError } from "../core/errors.js";

export type LLMProviderName = "mock" | "anthropic" | "openai";
export type YouTubeProviderName = "mock" | "youtube";
export type PrivacyStatus = "private" | "unlisted" | "public";
export type TTSProviderName = "silent" | "voicevox" | "openai";
export type RendererName = "ffmpeg" | "placeholder";
export type PublishTarget = "delivery" | "youtube";
export type LogLevelName = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";

export interface AppConfig {
  mockMode: boolean;
  rootDir: string;
  dataDir: string;
  logDir: string;
  promptsDir: string;
  /** delivery = finished videos are written to DELIVERY_DIR for manual upload (no YouTube API needed). */
  publishTarget: PublishTarget;
  deliveryDir: string;
  databaseUrl: string;
  logLevel: LogLevelName;
  logToFile: boolean;

  channel: {
    niche: string;
    language: string;
    regionCode: string;
    searchKeywords: string[];
  };

  llm: {
    provider: LLMProviderName;
    model: string;
    anthropicApiKey?: string;
    openaiApiKey?: string;
    openaiBaseUrl: string;
    timeoutMs: number;
    maxTokens: number;
    temperature: number;
  };

  youtube: {
    provider: YouTubeProviderName;
    apiKey?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri: string;
    tokenPath: string;
    /** Real uploads to YouTube happen only when this is explicitly true. */
    uploadEnabled: boolean;
    /** Public visibility must be explicitly allowed; otherwise uploads are forced to private. */
    allowPublic: boolean;
    defaultPrivacy: PrivacyStatus;
    categoryId: string;
    /** Self-imposed daily cap on YouTube Data API quota units (Google default quota is 10,000). */
    dailyQuotaUnits: number;
    minRequestIntervalMs: number;
    analyticsDelayHours: number;
  };

  pipeline: {
    autoPublish: boolean;
    dailyVideoLimit: number;
    maxRetries: number;
    maxScriptRevisions: number;
    agentTimeoutMinutes: number;
    heartbeatIntervalSeconds: number;
    heartbeatMissTolerance: number;
    watchdogIntervalSeconds: number;
    supervisorIntervalSeconds: number;
    workerPollIntervalMs: number;
    retryBaseDelayMs: number;
    autoContinue: boolean;
    /** Max pipelines in production (research → publish) at the same time when auto-continuing. */
    autopilotMaxConcurrent: number;
    /** Minimum minutes between two automatically started pipelines (spreads uploads over the day). */
    autopilotMinIntervalMinutes: number;
    /** Auto-continue pauses after this many failed pipelines in a row (circuit breaker). */
    autopilotMaxConsecutiveFailures: number;
    shortsMaxDurationSec: number;
    shortsMinDurationSec: number;
    experimentMinSamples: number;
  };

  video: {
    renderer: RendererName;
    ffmpegPath: string;
    ffprobePath: string;
    fontName?: string;
    bgmFile?: string;
    bgmVolume: number;
    /** Narration may be sped up by at most this factor to fit the Shorts length limit. */
    maxSpeedup: number;
    tts: {
      provider: TTSProviderName;
      voicevoxUrl: string;
      voicevoxSpeaker: number;
      voicevoxSpeed: number;
      voicevoxCredit: string;
      openaiModel: string;
      openaiVoice: string;
    };
  };

  dashboard: {
    host: string;
    port: number;
    token?: string;
  };

  notifications: {
    channels: string[];
    discordWebhookUrl?: string;
    slackWebhookUrl?: string;
  };
}

type Env = Record<string, string | undefined>;

function str(env: Env, key: string, fallback: string): string {
  const v = env[key];
  return v === undefined || v.trim() === "" ? fallback : v.trim();
}

function optional(env: Env, key: string): string | undefined {
  const v = env[key];
  return v === undefined || v.trim() === "" ? undefined : v.trim();
}

function bool(env: Env, key: string, fallback: boolean): boolean {
  const v = optional(env, key);
  if (v === undefined) return fallback;
  if (["true", "1", "yes", "on"].includes(v.toLowerCase())) return true;
  if (["false", "0", "no", "off"].includes(v.toLowerCase())) return false;
  throw new ConfigError(`${key} must be a boolean (true/false), got "${v}"`);
}

function int(env: Env, key: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const v = optional(env, key);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ConfigError(`${key} must be an integer, got "${v}"`);
  }
  if (n < min || n > max) throw new ConfigError(`${key} must be between ${min} and ${max}, got ${n}`);
  return n;
}

function num(env: Env, key: string, fallback: number): number {
  const v = optional(env, key);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ConfigError(`${key} must be a number, got "${v}"`);
  return n;
}

function oneOf<T extends string>(env: Env, key: string, allowed: readonly T[], fallback: T): T {
  const v = optional(env, key);
  if (v === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(v)) {
    throw new ConfigError(`${key} must be one of ${allowed.join(", ")}, got "${v}"`);
  }
  return v as T;
}

/** Makes relative sqlite paths relative to the project root (not the shell's cwd). */
function resolveSqliteUrl(url: string, rootDir: string): string {
  if (!url.startsWith("sqlite:")) return url;
  const file = url.slice("sqlite:".length);
  return file === ":memory:" ? url : `sqlite:${path.resolve(rootDir, file)}`;
}

/** Loads `.env` (if present) into process.env without overriding already-set variables. */
export function loadDotEnv(rootDir: string): void {
  const file = path.join(rootDir, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
}

export function loadConfig(env: Env = process.env, rootDir: string = process.cwd()): AppConfig {
  const mockMode = bool(env, "MOCK_MODE", true);
  const dataDir = path.resolve(rootDir, str(env, "DATA_DIR", "./data"));

  const llmProvider = oneOf<LLMProviderName>(env, "LLM_PROVIDER", ["mock", "anthropic", "openai"], "mock");
  const youtubeProvider = oneOf<YouTubeProviderName>(env, "YOUTUBE_PROVIDER", ["mock", "youtube"], "mock");

  const config: AppConfig = {
    mockMode,
    rootDir,
    dataDir,
    logDir: path.resolve(rootDir, str(env, "LOG_DIR", "./logs")),
    promptsDir: path.resolve(rootDir, str(env, "PROMPTS_DIR", "./prompts")),
    publishTarget: oneOf<PublishTarget>(env, "PUBLISH_TARGET", ["delivery", "youtube"], "delivery"),
    deliveryDir: path.resolve(rootDir, str(env, "DELIVERY_DIR", "./deliveries")),
    databaseUrl: resolveSqliteUrl(str(env, "DATABASE_URL", `sqlite:${path.join(dataDir, "company.db")}`), rootDir),
    logLevel: oneOf<LogLevelName>(env, "LOG_LEVEL", ["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"], "INFO"),
    logToFile: bool(env, "LOG_TO_FILE", true),

    channel: {
      niche: str(env, "CHANNEL_NICHE", "暮らしに役立つ科学と雑学"),
      language: str(env, "CHANNEL_LANGUAGE", "ja"),
      regionCode: str(env, "YOUTUBE_REGION_CODE", "JP"),
      searchKeywords: str(env, "RESEARCH_KEYWORDS", "雑学,ライフハック,科学")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },

    llm: {
      provider: mockMode ? "mock" : llmProvider,
      model: str(env, "LLM_MODEL", "mock-model"),
      anthropicApiKey: optional(env, "ANTHROPIC_API_KEY"),
      openaiApiKey: optional(env, "OPENAI_API_KEY"),
      openaiBaseUrl: str(env, "OPENAI_BASE_URL", "https://api.openai.com/v1"),
      timeoutMs: int(env, "LLM_TIMEOUT_MS", 120_000, 1_000),
      maxTokens: int(env, "LLM_MAX_TOKENS", 4096, 256),
      temperature: num(env, "LLM_TEMPERATURE", 0.7),
    },

    youtube: {
      provider: mockMode ? "mock" : youtubeProvider,
      apiKey: optional(env, "YOUTUBE_API_KEY"),
      clientId: optional(env, "YOUTUBE_CLIENT_ID"),
      clientSecret: optional(env, "YOUTUBE_CLIENT_SECRET"),
      redirectUri: str(env, "YOUTUBE_REDIRECT_URI", "http://127.0.0.1:53682/oauth2callback"),
      tokenPath: path.resolve(rootDir, str(env, "YOUTUBE_TOKEN_PATH", "./token.json")),
      uploadEnabled: bool(env, "YOUTUBE_UPLOAD_ENABLED", false),
      allowPublic: bool(env, "YOUTUBE_ALLOW_PUBLIC", false),
      defaultPrivacy: oneOf<PrivacyStatus>(env, "YOUTUBE_DEFAULT_PRIVACY", ["private", "unlisted", "public"], "private"),
      categoryId: str(env, "YOUTUBE_CATEGORY_ID", "27"),
      dailyQuotaUnits: int(env, "YOUTUBE_DAILY_QUOTA_UNITS", 5000, 1),
      minRequestIntervalMs: int(env, "YOUTUBE_MIN_REQUEST_INTERVAL_MS", 1000, 0),
      analyticsDelayHours: num(env, "ANALYTICS_DELAY_HOURS", mockMode ? 0 : 48),
    },

    pipeline: {
      autoPublish: bool(env, "AUTO_PUBLISH", false),
      dailyVideoLimit: int(env, "DAILY_VIDEO_LIMIT", 3, 0, 50),
      maxRetries: int(env, "MAX_RETRIES", 3, 0, 10),
      maxScriptRevisions: int(env, "MAX_SCRIPT_REVISIONS", 2, 0, 5),
      agentTimeoutMinutes: num(env, "AGENT_TIMEOUT_MINUTES", 30),
      heartbeatIntervalSeconds: num(env, "HEARTBEAT_INTERVAL_SECONDS", 60),
      heartbeatMissTolerance: int(env, "HEARTBEAT_MISS_TOLERANCE", 3, 1),
      watchdogIntervalSeconds: num(env, "WATCHDOG_INTERVAL_SECONDS", 60),
      supervisorIntervalSeconds: num(env, "SUPERVISOR_INTERVAL_SECONDS", 30),
      workerPollIntervalMs: int(env, "WORKER_POLL_INTERVAL_MS", 2000, 100),
      retryBaseDelayMs: int(env, "RETRY_BASE_DELAY_MS", 5000, 0),
      autoContinue: bool(env, "AUTO_CONTINUE", false),
      autopilotMaxConcurrent: int(env, "AUTOPILOT_MAX_CONCURRENT", 1, 1, 10),
      autopilotMinIntervalMinutes: num(env, "AUTOPILOT_MIN_INTERVAL_MINUTES", 180),
      autopilotMaxConsecutiveFailures: int(env, "AUTOPILOT_MAX_CONSECUTIVE_FAILURES", 2, 1, 20),
      shortsMaxDurationSec: int(env, "SHORTS_MAX_DURATION_SEC", 60, 5, 180),
      shortsMinDurationSec: int(env, "SHORTS_MIN_DURATION_SEC", 10, 1, 60),
      experimentMinSamples: int(env, "EXPERIMENT_MIN_SAMPLES", 3, 1, 50),
    },

    video: {
      renderer: oneOf<RendererName>(env, "VIDEO_RENDERER", ["ffmpeg", "placeholder"], "ffmpeg"),
      ffmpegPath: str(env, "FFMPEG_PATH", "ffmpeg"),
      ffprobePath: str(env, "FFPROBE_PATH", "ffprobe"),
      fontName: optional(env, "VIDEO_FONT_NAME"),
      bgmFile: optional(env, "BGM_FILE") ? path.resolve(rootDir, optional(env, "BGM_FILE")!) : undefined,
      bgmVolume: num(env, "BGM_VOLUME", 0.12),
      maxSpeedup: num(env, "NARRATION_MAX_SPEEDUP", 1.3),
      tts: {
        provider: oneOf<TTSProviderName>(env, "TTS_PROVIDER", ["silent", "voicevox", "openai"], mockMode ? "silent" : "voicevox"),
        voicevoxUrl: str(env, "VOICEVOX_URL", "http://127.0.0.1:50021"),
        voicevoxSpeaker: int(env, "VOICEVOX_SPEAKER", 3, 0, 10_000),
        voicevoxSpeed: num(env, "VOICEVOX_SPEED", 1.15),
        voicevoxCredit: str(env, "VOICEVOX_CREDIT", "VOICEVOX:ずんだもん"),
        openaiModel: str(env, "OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
        openaiVoice: str(env, "OPENAI_TTS_VOICE", "alloy"),
      },
    },

    dashboard: {
      host: str(env, "DASHBOARD_HOST", "127.0.0.1"),
      port: int(env, "DASHBOARD_PORT", 3100, 0, 65535),
      token: optional(env, "DASHBOARD_TOKEN"),
    },

    notifications: {
      channels: str(env, "NOTIFY_CHANNELS", "console")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      discordWebhookUrl: optional(env, "DISCORD_WEBHOOK_URL"),
      slackWebhookUrl: optional(env, "SLACK_WEBHOOK_URL"),
    },
  };

  validateConfig(config);
  return config;
}

function validateConfig(c: AppConfig): void {
  if (c.llm.provider === "anthropic" && !c.llm.anthropicApiKey) {
    throw new ConfigError("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY (or set MOCK_MODE=true)");
  }
  if (c.llm.provider === "openai" && !c.llm.openaiApiKey) {
    throw new ConfigError("LLM_PROVIDER=openai requires OPENAI_API_KEY (or set MOCK_MODE=true)");
  }
  if (c.llm.provider !== "mock" && c.llm.model === "mock-model") {
    throw new ConfigError("LLM_MODEL must be set when using a real LLM provider");
  }
  if (c.youtube.provider === "youtube" && !c.youtube.apiKey && !(c.youtube.clientId && c.youtube.clientSecret)) {
    throw new ConfigError(
      "YOUTUBE_PROVIDER=youtube requires YOUTUBE_API_KEY (research) and/or YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET (OAuth)",
    );
  }
  if (c.youtube.defaultPrivacy === "public" && !c.youtube.allowPublic) {
    throw new ConfigError("YOUTUBE_DEFAULT_PRIVACY=public requires YOUTUBE_ALLOW_PUBLIC=true");
  }
  if (c.video.tts.provider === "openai" && !c.llm.openaiApiKey) {
    throw new ConfigError("TTS_PROVIDER=openai requires OPENAI_API_KEY");
  }
  if (c.video.maxSpeedup < 1 || c.video.maxSpeedup > 2) throw new ConfigError("NARRATION_MAX_SPEEDUP must be between 1 and 2");
  if (c.pipeline.shortsMinDurationSec >= c.pipeline.shortsMaxDurationSec) {
    throw new ConfigError("SHORTS_MIN_DURATION_SEC must be smaller than SHORTS_MAX_DURATION_SEC");
  }
  if (!c.databaseUrl.startsWith("sqlite:")) {
    throw new ConfigError(`Unsupported DATABASE_URL "${c.databaseUrl}". Only sqlite: is implemented (see src/database/README).`);
  }
}

/** Returns a copy of the config safe to display (secrets masked). */
export function redactConfig(c: AppConfig): Record<string, unknown> {
  const mask = (v?: string) => (v ? `${v.slice(0, 3)}***` : undefined);
  return {
    ...c,
    llm: { ...c.llm, anthropicApiKey: mask(c.llm.anthropicApiKey), openaiApiKey: mask(c.llm.openaiApiKey) },
    youtube: { ...c.youtube, apiKey: mask(c.youtube.apiKey), clientSecret: mask(c.youtube.clientSecret) },
    dashboard: { ...c.dashboard, token: mask(c.dashboard.token) },
    notifications: {
      ...c.notifications,
      discordWebhookUrl: mask(c.notifications.discordWebhookUrl),
      slackWebhookUrl: mask(c.notifications.slackWebhookUrl),
    },
  };
}
