import type {
  GenerateArticleInput,
  GenerateArticleResult,
  NoteArticle,
  NoteGenerator,
} from "./types";

function createArticleId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildMockTitle(script: GenerateArticleInput["script"]): string {
  const base = script.hook.trim() || "TikTok動画から紐解く、今注目のテーマ";
  return `${base}｜note`;
}

function buildMockBody(script: GenerateArticleInput["script"]): string {
  const paragraphs: string[] = [];

  if (script.hook.trim()) {
    paragraphs.push(script.hook.trim());
    paragraphs.push("");
  }

  paragraphs.push(
    "この記事では、ショート動画の企画背景や制作意図、視聴者に伝えたいポイントを整理してお届けします。"
  );
  paragraphs.push("");

  if (script.narration.trim()) {
    paragraphs.push("## 動画で語っていること");
    paragraphs.push(script.narration.trim());
    paragraphs.push("");
  }

  if (script.structure.length > 0) {
    paragraphs.push("## 構成のポイント");
    script.structure.forEach((scene) => {
      if (scene.content.trim()) {
        paragraphs.push(`- ${scene.time}: ${scene.content.trim()}`);
      }
    });
    paragraphs.push("");
  }

  if (script.video_prompt.trim()) {
    paragraphs.push("## 映像の狙い");
    paragraphs.push(script.video_prompt.trim());
    paragraphs.push("");
  }

  paragraphs.push(
    "動画と併せてご覧いただくと、より深く楽しんでいただけます。"
  );

  return paragraphs.join("\n").trim();
}

function buildMockHashtags(script: GenerateArticleInput["script"]): string[] {
  const base = ["#TikTok", "#ショート動画", "#動画制作", "#note"];
  const topics: string[] = [];

  const sourceText = `${script.hook} ${script.narration}`;
  if (sourceText.includes("AI") || sourceText.includes("人工知能")) {
    topics.push("#AI");
  }
  if (sourceText.includes("ビジネス") || sourceText.includes("副業")) {
    topics.push("#ビジネス");
  }
  if (sourceText.includes("ライフスタイル") || sourceText.includes("日常")) {
    topics.push("#ライフスタイル");
  }
  if (sourceText.includes("料理") || sourceText.includes("レシピ")) {
    topics.push("#料理");
  }

  return [...base, ...topics];
}

function buildMockEyeCatchPrompt(script: GenerateArticleInput["script"]): string {
  const theme = script.hook.trim() || "short-form video content";
  return `Eye-catching editorial illustration for a note article about "${theme}". Clean modern Japanese web media style, soft gradient background in purple and white, minimalist icons, easy-to-read title placement, friendly and professional mood.`;
}

/**
 * モック実装の NoteGenerator。
 * 外部APIキーが無い状態でも動作確認できるようにするための実装。
 */
export class MockNoteGenerator implements NoteGenerator {
  readonly providerName = "mock";

  async generateArticle(input: GenerateArticleInput): Promise<GenerateArticleResult> {
    const { script, ideaId } = input;

    const article: NoteArticle = {
      id: createArticleId(),
      ideaId,
      title: buildMockTitle(script),
      body: buildMockBody(script),
      hashtags: buildMockHashtags(script),
      eyeCatchPrompt: buildMockEyeCatchPrompt(script),
      isGenerated: true,
      generatedAt: new Date().toISOString(),
    };

    return { article, isMock: true };
  }
}
