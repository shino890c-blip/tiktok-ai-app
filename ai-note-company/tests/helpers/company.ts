import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCompany, type Company, type CompanyOverrides } from "../../src/company";
import { loadConfig, type AppConfig } from "../../src/config";
import { ConsoleChannel } from "../../src/notifications/notificationService";
import { MockNotePublisher } from "../../src/note/publisher/mockPublisher";

process.env.AI_NOTE_QUIET = "1";

export interface TestCompany {
  c: Company;
  dir: string;
  channel: ConsoleChannel;
  publisher: MockNotePublisher;
  cleanup(): void;
}

export function testConfig(dir: string, env: Record<string, string> = {}): AppConfig {
  return loadConfig(
    {
      RUN_MODE: "mock",
      SCHEDULE_MODE: "immediate",
      DATA_DIR: path.join(dir, "data"),
      LOG_DIR: path.join(dir, "logs"),
      DATABASE_PATH: path.join(dir, "data", "test.db"),
      NOTE_STORAGE_STATE: path.join(dir, ".auth", "note-storage.json"),
      MAX_RETRIES: "3",
      ...env,
    },
    path.resolve(__dirname, "../.."),
  );
}

export function makeCompany(env: Record<string, string> = {}, overrides: CompanyOverrides = {}): TestCompany {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-note-test-"));
  const config = testConfig(dir, env);
  const channel = new ConsoleChannel(true);
  const publisher = new MockNotePublisher(path.join(config.dataDir, "mock-note"));
  const c = createCompany(config, { quiet: true, retryBackoffSeconds: 0, notificationChannel: channel, publisher, sources: [], ...overrides });
  return {
    c,
    dir,
    channel,
    publisher,
    cleanup() {
      try {
        c.close();
      } catch {
        /* already closed */
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
