import { promises as fs } from "fs";
import path from "path";
import { normalizeStructure } from "./structure";
import type {
  GeneratePromptsInput,
  GeneratePromptsResult,
  GenerateVoiceInput,
  GenerateVoiceResult,
  ScenePrompt,
  VideoGenerator,
} from "./types";

const AUDIO_DIR = path.join(process.cwd(), "public", "generated", "audio");

/**
 * シーンの場面説明から、動画生成AI向けの英語プロンプトを組み立てる簡易テンプレート。
 * 実際のLLM/動画生成APIを使わないモック用のフォールバック。
 */
function buildMockPrompt(content: string, hook: string, sceneIndex: number): string {
  const style =
    "vertical 9:16 short-form video, cinematic lighting, smooth camera motion, high detail, trending TikTok aesthetic";
  if (sceneIndex === 1) {
    return `Opening hook shot: ${content}. Inspired by: "${hook}". ${style}.`;
  }
  return `Scene ${sceneIndex}: ${content}. ${style}.`;
}

/**
 * モック実装の VideoGenerator。
 * 外部APIキーが無い状態でも動作確認できるようにするための実装。
 */
export class MockVideoGenerator implements VideoGenerator {
  readonly providerName = "mock";

  async generatePrompts(input: GeneratePromptsInput): Promise<GeneratePromptsResult> {
    const { script } = input;
    const normalized = normalizeStructure(script.structure);

    const scenes: ScenePrompt[] = normalized.map((scene) => ({
      sceneIndex: scene.sceneIndex,
      time: scene.time,
      startSec: scene.startSec,
      endSec: scene.endSec,
      content: scene.content,
      prompt: buildMockPrompt(scene.content, script.hook, scene.sceneIndex),
    }));

    return { scenes, isMock: true };
  }

  async generateVoice(input: GenerateVoiceInput): Promise<GenerateVoiceResult> {
    const id = input.id ?? `voice-${Date.now()}`;
    await fs.mkdir(AUDIO_DIR, { recursive: true });

    const fileName = `${id}.mock.txt`;
    const filePath = path.join(AUDIO_DIR, fileName);

    // 実音声ファイルの代わりに、生成予定のナレーション内容をテキストで保存する。
    const placeholderContent = [
      "[MOCK AUDIO FILE]",
      "この音声はモック実装により生成されたダミーファイルです。",
      "OPENAI_API_KEY を設定すると実際のTTS音声が生成されます。",
      "",
      "--- ナレーション原稿 ---",
      input.script.narration,
    ].join("\n");

    await fs.writeFile(filePath, placeholderContent, "utf-8");

    return {
      audioUrl: `/generated/audio/${fileName}`,
      filePath,
      model: "mock-tts",
      voice: "alloy",
      isMock: true,
    };
  }
}
