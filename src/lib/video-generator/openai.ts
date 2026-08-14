import { promises as fs } from "fs";
import path from "path";
import { normalizeStructure } from "./structure";
import { MockVideoGenerator } from "./mock";
import type {
  GeneratePromptsInput,
  GeneratePromptsResult,
  GenerateVoiceInput,
  GenerateVoiceResult,
  ScenePrompt,
  VideoGenerator,
} from "./types";

const AUDIO_DIR = path.join(process.cwd(), "public", "generated", "audio");

const OPENAI_CHAT_MODEL = "gpt-4o-mini";
const OPENAI_TTS_MODEL = "tts-1";
const OPENAI_TTS_VOICE = "alloy";

/**
 * OpenAI API を利用した VideoGenerator 実装。
 * OPENAI_API_KEY が未設定の場合はモック実装にフォールバックする。
 */
export class OpenAIVideoGenerator implements VideoGenerator {
  readonly providerName = "openai";

  private readonly apiKey: string | undefined;
  private readonly fallback = new MockVideoGenerator();

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  private get hasApiKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async generatePrompts(input: GeneratePromptsInput): Promise<GeneratePromptsResult> {
    if (!this.hasApiKey) {
      return this.fallback.generatePrompts(input);
    }

    const { script } = input;
    const normalized = normalizeStructure(script.structure);

    try {
      const scenes: ScenePrompt[] = await Promise.all(
        normalized.map(async (scene) => {
          const prompt = await this.requestScenePrompt(script.hook, script.narration, scene.content);
          return {
            sceneIndex: scene.sceneIndex,
            time: scene.time,
            startSec: scene.startSec,
            endSec: scene.endSec,
            content: scene.content,
            prompt,
          };
        })
      );

      return { scenes, isMock: false };
    } catch {
      // API呼び出しに失敗した場合はモックにフォールバックする
      return this.fallback.generatePrompts(input);
    }
  }

  private async requestScenePrompt(
    hook: string,
    narration: string,
    sceneContent: string
  ): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_CHAT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are an expert prompt engineer for AI video generation tools (e.g. Runway, Sora, Pika). " +
              "Given a short-form vertical video scene description in Japanese, write a single concise English " +
              "video generation prompt optimized for those tools. Include camera movement, lighting, and mood. " +
              "Output only the prompt text, no explanations, no quotes.",
          },
          {
            role: "user",
            content: `Hook: ${hook}\nNarration context: ${narration}\nScene description: ${sceneContent}`,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API エラー: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("OpenAI API から有効なプロンプトが返されませんでした");
    }
    return text.trim();
  }

  async generateVoice(input: GenerateVoiceInput): Promise<GenerateVoiceResult> {
    if (!this.hasApiKey) {
      return this.fallback.generateVoice(input);
    }

    const id = input.id ?? `voice-${Date.now()}`;

    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_TTS_MODEL,
          voice: OPENAI_TTS_VOICE,
          input: input.script.narration,
          response_format: "mp3",
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI TTS API エラー: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      await fs.mkdir(AUDIO_DIR, { recursive: true });

      const fileName = `${id}.mp3`;
      const filePath = path.join(AUDIO_DIR, fileName);
      await fs.writeFile(filePath, Buffer.from(arrayBuffer));

      return {
        audioUrl: `/generated/audio/${fileName}`,
        filePath,
        model: OPENAI_TTS_MODEL,
        voice: OPENAI_TTS_VOICE,
        isMock: false,
      };
    } catch {
      return this.fallback.generateVoice(input);
    }
  }
}
