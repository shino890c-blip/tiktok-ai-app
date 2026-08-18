import { MockNoteGenerator } from "./mock";
import { OpenAINoteGenerator } from "./openai";
import type { NoteGenerator } from "./types";

export type { NoteGenerator } from "./types";
export * from "./types";

/**
 * NOTE_GENERATOR_PROVIDER 環境変数に応じて NoteGenerator の実装を切り替える。
 * - "mock": モック実装（常にダミーデータ）
 * - "openai": OpenAI API を使用
 * NOTE_GENERATOR_PROVIDER が未設定の場合、OPENAI_API_KEY が設定されていれば
 * "openai" を、それ以外は "mock" をデフォルトとする。
 */
export function getNoteGenerator(): NoteGenerator {
  const provider = (
    process.env.NOTE_GENERATOR_PROVIDER ?? (process.env.OPENAI_API_KEY ? "openai" : "mock")
  ).toLowerCase();

  switch (provider) {
    case "mock":
      return new MockNoteGenerator();
    case "openai":
    default:
      return new OpenAINoteGenerator();
  }
}
