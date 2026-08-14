import { MockVideoGenerator } from "./mock";
import { OpenAIVideoGenerator } from "./openai";
import { RunwayVideoGenerator } from "./runway";
import type { VideoGenerator } from "./types";

export type { VideoGenerator } from "./types";
export * from "./types";

/**
 * VIDEO_GENERATOR_PROVIDER 環境変数に応じて VideoGenerator の実装を切り替える。
 * - "mock": モック実装（常にダミーデータ）
 * - "openai" (既定値): OpenAI API を使用。APIキー未設定時はモックにフォールバック
 * - "runway": 将来のRunway API用（現状はスタブ、モックにフォールバック）
 */
export function getVideoGenerator(): VideoGenerator {
  const provider = (process.env.VIDEO_GENERATOR_PROVIDER ?? "openai").toLowerCase();

  switch (provider) {
    case "mock":
      return new MockVideoGenerator();
    case "runway":
      return new RunwayVideoGenerator();
    case "openai":
    default:
      return new OpenAIVideoGenerator();
  }
}
