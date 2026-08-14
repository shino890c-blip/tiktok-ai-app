import { MockNotePublisher } from "./mock";
import { PlaywrightNotePublisher } from "./playwright";
import type { NotePublisher } from "./types";

export type { NotePublisher } from "./types";
export * from "./types";

/**
 * NOTE_PUBLISHER_PROVIDER 環境変数に応じて NotePublisher の実装を切り替える。
 * - "mock": モック実装（ブラウザ操作を行わない）
 * - "playwright" (既定値): Playwright + ユーザーのChromeプロファイルで下書き保存を自動化
 */
export function getNotePublisher(): NotePublisher {
  const provider = (process.env.NOTE_PUBLISHER_PROVIDER ?? "playwright").toLowerCase();

  switch (provider) {
    case "mock":
      return new MockNotePublisher();
    case "playwright":
    default:
      return new PlaywrightNotePublisher();
  }
}
