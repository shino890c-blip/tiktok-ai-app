/**
 * 動画制作素材の自動生成パイプライン - 共有型定義
 */

/** 台本の秒数構成の1コマ */
export interface ScriptStructureItem {
  /** 例: "0-5秒" */
  time: string;
  /** 場面説明 */
  content: string;
}

/** アプリ内で扱う承認済み台本データ */
export interface Script {
  /** 冒頭フック文 */
  hook: string;
  /** ナレーション原稿 */
  narration: string;
  /** 秒数構成 */
  structure: ScriptStructureItem[];
  /** 映像プロンプト（台本作成時点の簡易版） */
  video_prompt: string;
}

/** シーンごとに生成された映像プロンプト */
export interface ScenePrompt {
  /** シーン番号（1始まり） */
  sceneIndex: number;
  /** 秒数構成の time 表記（例: "0-5秒") */
  time: string;
  /** 開始秒 */
  startSec: number;
  /** 終了秒 */
  endSec: number;
  /** 元の場面説明 */
  content: string;
  /** 動画生成AI向けに最適化された英語プロンプト */
  prompt: string;
}

/** 映像プロンプト生成の入出力 */
export interface GeneratePromptsInput {
  script: Script;
}

export interface GeneratePromptsResult {
  scenes: ScenePrompt[];
  /** モックデータで生成されたかどうか */
  isMock: boolean;
}

/** ナレーション音声生成の入出力 */
export interface GenerateVoiceInput {
  script: Script;
  /** ファイル名に使う識別子。省略時は自動生成 */
  id?: string;
}

export interface GenerateVoiceResult {
  /** public 配下からの相対URL（例: /generated/audio/xxx.mp3） */
  audioUrl: string;
  /** 保存先の絶対パス */
  filePath: string;
  /** 使用した音声モデル */
  model: string;
  /** 使用した音声（voice） */
  voice: string;
  /** モックデータで生成されたかどうか */
  isMock: boolean;
}

/** 字幕(SRT)生成の入出力 */
export interface GenerateSubtitlesInput {
  script: Script;
  id?: string;
}

export interface GenerateSubtitlesResult {
  /** public 配下からの相対URL（例: /generated/subtitles/xxx.srt） */
  subtitleUrl: string;
  /** 保存先の絶対パス */
  filePath: string;
  /** 生成されたSRT本文 */
  srtContent: string;
}

/**
 * 動画制作素材ジェネレーターの抽象インターフェース。
 * 将来 Runway 等の外部動画生成APIに切り替える際も、
 * このインターフェースを実装するだけでよい。
 */
export interface VideoGenerator {
  /** プロバイダー名（"mock" | "runway" など） */
  readonly providerName: string;

  /** シーンごとの映像プロンプトを生成する */
  generatePrompts(input: GeneratePromptsInput): Promise<GeneratePromptsResult>;

  /** ナレーション音声を生成する */
  generateVoice(input: GenerateVoiceInput): Promise<GenerateVoiceResult>;
}
