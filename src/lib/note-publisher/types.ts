/**
 * note.com への半自動投稿（下書き保存）パイプライン - 共有型定義
 *
 * note には公式APIが存在せず、非公式APIの認証は reCAPTCHA v3 が必須化されており
 * 直接HTTPでの自動化は困難（詳細: planning/note-api-investigation.md）。
 * そのため、ユーザーが note.com にログイン済みの Chrome プロファイルを利用し、
 * Playwright でエディタ画面を操作して「下書き保存」まで自動化する。
 * 公開は必ずユーザーが手動で行う。
 */

/** 下書き保存の入力 */
export interface PublishDraftInput {
  /** 記事タイトル */
  title: string;
  /** 記事本文（プレーンテキスト/Markdown想定） */
  body: string;
  /** ハッシュタグ（"#"の有無は問わない） */
  hashtags: string[];
}

/** 下書き保存の結果 */
export interface PublishDraftResult {
  success: true;
  /** 下書き編集画面のURL（取得できた場合） */
  draftUrl?: string;
}

/** 下書き保存の失敗結果 */
export interface PublishDraftFailure {
  success: false;
  /** ユーザー向けの明確なエラーメッセージ */
  error: string;
}

/**
 * note 記事の半自動投稿（下書き保存）を行う抽象インターフェース。
 * 実装は「下書き保存」までしか行わない。公開操作は提供しない。
 */
export interface NotePublisher {
  /** プロバイダー名（"playwright" | "mock" など） */
  readonly providerName: string;

  /**
   * note.com にタイトル・本文・ハッシュタグを入力し、下書き保存する。
   * 公開は行わず、ブラウザはユーザーが確認できるよう開いたままにする。
   */
  publishDraft(
    input: PublishDraftInput
  ): Promise<PublishDraftResult | PublishDraftFailure>;
}
