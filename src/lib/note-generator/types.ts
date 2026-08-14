import type { Script } from "@/lib/video-generator/types";

/** note 記事のデータモデル */
export interface NoteArticle {
  id: string;
  ideaId: string;
  title: string;
  body: string;
  hashtags: string[];
  eyeCatchPrompt: string;
  isGenerated: boolean;
  generatedAt: string;
}

/** 記事生成の入力 */
export interface GenerateArticleInput {
  script: Script;
  ideaId: string;
}

/** 記事生成の結果 */
export interface GenerateArticleResult {
  article: NoteArticle;
  /** モックデータで生成されたかどうか */
  isMock: boolean;
}

/**
 * note 記事ジェネレーターの抽象インターフェース。
 * 将来 note 公式 API 等が利用可能になった場合も、
 * このインターフェースを実装するだけで切り替え可能。
 */
export interface NoteGenerator {
  /** プロバイダー名（"mock" | "openai" など） */
  readonly providerName: string;

  /** 台本から note 向け記事を生成する */
  generateArticle(input: GenerateArticleInput): Promise<GenerateArticleResult>;
}
