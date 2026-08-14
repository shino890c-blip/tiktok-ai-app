import { MockNoteGenerator } from "./mock";
import type {
  GenerateArticleInput,
  GenerateArticleResult,
  NoteArticle,
  NoteGenerator,
} from "./types";

const OPENAI_CHAT_MODEL = "gpt-4o-mini";

interface OpenAINoteArticleShape {
  title: string;
  body: string;
  hashtags: string[];
  eyeCatchPrompt: string;
}

/**
 * OpenAI API を利用した NoteGenerator 実装。
 * OPENAI_API_KEY が未設定の場合はモック実装にフォールバックする。
 */
export class OpenAINoteGenerator implements NoteGenerator {
  readonly providerName = "openai";

  private readonly apiKey: string | undefined;
  private readonly fallback = new MockNoteGenerator();

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  private get hasApiKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async generateArticle(input: GenerateArticleInput): Promise<GenerateArticleResult> {
    if (!this.hasApiKey) {
      return this.fallback.generateArticle(input);
    }

    try {
      const article = await this.requestArticle(input);
      return { article, isMock: false };
    } catch {
      // API呼び出しに失敗した場合はモックにフォールバックする
      return this.fallback.generateArticle(input);
    }
  }

  private async requestArticle(input: GenerateArticleInput): Promise<NoteArticle> {
    const { script, ideaId } = input;

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
              "You are an expert Japanese web media editor who writes articles for note.com. " +
              "Given a TikTok short video script, write a compelling note article in Japanese. " +
              "Output valid JSON with keys: title (string), body (string with markdown), " +
              "hashtags (array of strings starting with #), eyeCatchPrompt (string in English describing an eye-catching header image). " +
              "No extra commentary outside JSON.",
          },
          {
            role: "user",
            content: this.buildPrompt(script),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API エラー: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("OpenAI API から有効な記事が返されませんでした");
    }

    const parsed: OpenAINoteArticleShape = JSON.parse(text);

    return {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ideaId,
      title: parsed.title,
      body: parsed.body,
      hashtags: parsed.hashtags,
      eyeCatchPrompt: parsed.eyeCatchPrompt,
      isGenerated: true,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildPrompt(script: GenerateArticleInput["script"]): string {
    const structureText = script.structure
      .map((scene) => `- ${scene.time}: ${scene.content}`)
      .join("\n");

    return [
      "以下のTikTokショート動画台本をもとに、note.com向けの記事を作成してください。",
      "",
      "## フック",
      script.hook || "（未指定）",
      "",
      "## ナレーション原稿",
      script.narration || "（未指定）",
      "",
      "## 秒数構成",
      structureText || "（未指定）",
      "",
      "## 映像プロンプト",
      script.video_prompt || "（未指定）",
    ].join("\n");
  }
}
