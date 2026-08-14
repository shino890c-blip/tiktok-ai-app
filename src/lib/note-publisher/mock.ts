import type {
  NotePublisher,
  PublishDraftFailure,
  PublishDraftInput,
  PublishDraftResult,
} from "./types";

/**
 * モック実装の NotePublisher。
 * Playwright/Chromeプロファイルが無い開発環境でも動作確認できるようにするための実装。
 * 実際のブラウザ操作は行わず、常に成功したものとしてダミーのURLを返す。
 */
export class MockNotePublisher implements NotePublisher {
  readonly providerName = "mock";

  async publishDraft(
    input: PublishDraftInput
  ): Promise<PublishDraftResult | PublishDraftFailure> {
    if (!input.title.trim() || !input.body.trim()) {
      return {
        success: false,
        error: "タイトルと本文は必須です。",
      };
    }

    return {
      success: true,
      draftUrl: "https://note.com/notes/mock-draft",
    };
  }
}
