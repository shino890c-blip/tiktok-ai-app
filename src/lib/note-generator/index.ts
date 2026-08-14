import { MockNoteGenerator } from "./mock";
import { OpenAINoteGenerator } from "./openai";
import type { NoteGenerator } from "./types";

export type { NoteGenerator } from "./types";
export * from "./types";

/**
 * NOTE_GENERATOR_PROVIDER 環境変数に応じて NoteGenerator の実装を切り替える。
 * - "mock": モック実装（常にダミーデータ）
 * - "openai" (既定値): OpenAI API を使用。APIキー未設定時はモックにフォールバック
 */
export function getNoteGenerator(): NoteGenerator {
  const provider = (process.env.NOTE_GENERATOR_PROVIDER ?? "openai").toLowerCase();

  switch (provider) {
    case "mock":
      return new MockNoteGenerator();
    case "openai":
    default:
      return new OpenAINoteGenerator();
  }
}
