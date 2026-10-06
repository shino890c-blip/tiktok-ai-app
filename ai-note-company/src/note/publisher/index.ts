import path from "node:path";
import type { AppConfig } from "../../config";
import type { Logger } from "../../logger";
import { MockNotePublisher } from "./mockPublisher";
import { PlaywrightNotePublisher } from "./playwrightPublisher";
import type { NotePublisher } from "./types";

export * from "./types";
export { MockNotePublisher } from "./mockPublisher";

export function createNotePublisher(config: AppConfig, logger: Logger): NotePublisher {
  return config.note.publisher === "playwright"
    ? new PlaywrightNotePublisher(config, logger)
    : new MockNotePublisher(path.join(config.dataDir, "mock-note"));
}
