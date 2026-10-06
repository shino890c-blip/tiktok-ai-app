import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "../src/config/index.js";
import type { Clock } from "../src/core/clock.js";
import { createCompany, type Company } from "../src/core/company.js";
import { SqliteDatabase } from "../src/database/connection.js";
import type { LLMProvider } from "../src/llm/index.js";
import { MemorySink } from "../src/logging/logger.js";
import { MemoryChannel, MultiChannelNotificationService } from "../src/notifications/index.js";
import { MockYouTubeProvider, type YouTubeProvider } from "../src/youtube/index.js";
import { createLogger } from "../src/logging/logger.js";
import { PlaceholderRenderer, type VideoRenderer } from "../src/video/renderer.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface TestCompany extends Company {
  config: AppConfig;
  logs: MemorySink;
  notifications: MemoryChannel;
  youtubeMock: MockYouTubeProvider | null;
  dataDir: string;
  cleanup(): Promise<void>;
}

export async function createTestCompany(
  opts: { env?: Record<string, string>; clock?: Clock; llm?: LLMProvider; youtube?: YouTubeProvider; renderer?: VideoRenderer } = {},
): Promise<TestCompany> {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "ytco-test-"));
  const config = loadConfig(
    {
      MOCK_MODE: "true",
      DATA_DIR: dataDir,
      LOG_DIR: path.join(dataDir, "logs"),
      DATABASE_URL: "sqlite::memory:",
      LOG_TO_FILE: "false",
      RETRY_BASE_DELAY_MS: "0",
      NOTIFY_CHANNELS: "none",
      LOG_LEVEL: "DEBUG",
      AUTOPILOT_MIN_INTERVAL_MINUTES: "0",
      PUBLISH_TARGET: "youtube",
      DELIVERY_DIR: path.join(dataDir, "deliveries"),
      ...opts.env,
    },
    ROOT,
  );
  const logs = new MemorySink(5000);
  const notifications = new MemoryChannel();
  const notifier = new MultiChannelNotificationService([notifications], createLogger({ sinks: [logs] }), "INFO");
  const youtubeMock = opts.youtube ? null : new MockYouTubeProvider(opts.clock);
  const company = await createCompany(config, {
    db: new SqliteDatabase(":memory:"),
    clock: opts.clock,
    llm: opts.llm,
    youtube: opts.youtube ?? youtubeMock!,
    renderer: opts.renderer ?? new PlaceholderRenderer(),
    notifier,
    logSinks: [logs],
  });
  return Object.assign(company, {
    config,
    logs,
    notifications,
    youtubeMock,
    dataDir,
    async cleanup() {
      await company.stop();
      rmSync(dataDir, { recursive: true, force: true });
    },
  });
}

/** Runs the whole pipeline up to (and including) the approval request. */
export async function runToApproval(c: Company): Promise<string> {
  const { pipeline } = await c.supervisor.startPipeline("新しい動画を作る");
  await c.worker.runUntilIdle();
  return pipeline!.pipeline_id;
}
