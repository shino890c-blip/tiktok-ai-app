import { chromium, type BrowserContext, type Page } from "playwright";
import type {
  NotePublisher,
  PublishDraftFailure,
  PublishDraftInput,
  PublishDraftResult,
} from "./types";

const NOTE_NEW_ARTICLE_URL = "https://note.com/notes/new";
const NAVIGATION_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 15_000;

/** ログイン導線に戻された（=未ログイン）と判定するURLパターン */
const LOGIN_URL_PATTERNS = ["/login", "/signup"];

function isLoggedOutUrl(url: string): boolean {
  return LOGIN_URL_PATTERNS.some((pattern) => url.includes(pattern));
}

/**
 * Playwright を用いた NotePublisher 実装。
 *
 * note には公式APIが存在せず、非公式APIは reCAPTCHA v3 必須化により直接HTTPでの
 * 自動ログインが実質不可能なため（詳細: planning/note-api-investigation.md）、
 * ユーザーが note.com にログイン済みの Chrome プロファイルをそのまま利用し、
 * ブラウザ操作でタイトル・本文・ハッシュタグを入力して「下書き保存」のみを行う。
 *
 * - 公開ボタンは絶対にクリックしない（ユーザーが手動で確認・公開する）。
 * - 操作完了後もブラウザは閉じず、ユーザーが note 上で内容を確認できる状態にする。
 */
export class PlaywrightNotePublisher implements NotePublisher {
  readonly providerName = "playwright";

  private readonly userDataDir: string | undefined;

  constructor() {
    this.userDataDir = process.env.CHROME_USER_DATA_DIR;
  }

  async publishDraft(
    input: PublishDraftInput
  ): Promise<PublishDraftResult | PublishDraftFailure> {
    if (!input.title.trim() || !input.body.trim()) {
      return { success: false, error: "タイトルと本文は必須です。" };
    }

    if (!this.userDataDir || this.userDataDir.trim().length === 0) {
      return {
        success: false,
        error:
          "Chromeプロファイルのパスが設定されていません。環境変数 CHROME_USER_DATA_DIR に、noteにログイン済みのChromeユーザーデータディレクトリを指定してください。",
      };
    }

    let context: BrowserContext | undefined;

    try {
      context = await chromium.launchPersistentContext(this.userDataDir, {
        channel: "chrome",
        headless: false,
      });
    } catch {
      return {
        success: false,
        error:
          "Chromeプロファイルを開けませんでした。CHROME_USER_DATA_DIR のパスが正しいか、Chromeが既に起動していないか確認してください。",
      };
    }

    let page: Page | undefined;

    try {
      page = context.pages()[0] ?? (await context.newPage());
      page.setDefaultTimeout(ACTION_TIMEOUT_MS);

      await page.goto(NOTE_NEW_ARTICLE_URL, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });

      if (isLoggedOutUrl(page.url())) {
        return {
          success: false,
          error:
            "noteにログインしていません。指定されたChromeプロファイルでnote.comに手動でログインしてから、再度お試しください。",
        };
      }

      await this.fillTitle(page, input.title);
      await this.fillBody(page, input.body);
      await this.setHashtags(page, input.hashtags);

      const draftUrl = await this.saveDraft(page);

      return { success: true, draftUrl };
    } catch {
      return {
        success: false,
        error:
          "noteの画面操作に失敗しました。noteの画面構成が変更された可能性があります。手動で下書きを作成してください。",
      };
    }
    // 成功・失敗にかかわらずブラウザは閉じない。
    // ユーザーが内容を確認し、必要であれば手動で公開できるようにするため。
  }

  private async fillTitle(page: Page, title: string): Promise<void> {
    const titleField = page
      .getByPlaceholder("記事タイトル")
      .or(page.locator('textarea[placeholder*="タイトル"]'))
      .first();

    await titleField.waitFor({ state: "visible", timeout: ACTION_TIMEOUT_MS });
    await titleField.click();
    await titleField.fill(title);
  }

  private async fillBody(page: Page, body: string): Promise<void> {
    const bodyField = page
      .locator('div[contenteditable="true"]')
      .first();

    await bodyField.waitFor({ state: "visible", timeout: ACTION_TIMEOUT_MS });
    await bodyField.click();
    await page.keyboard.type(body, { delay: 5 });
  }

  private async setHashtags(page: Page, hashtags: string[]): Promise<void> {
    const cleaned = hashtags
      .map((tag) => tag.trim().replace(/^#/, ""))
      .filter((tag) => tag.length > 0);

    if (cleaned.length === 0) {
      return;
    }

    const hashtagField = page
      .locator('input[placeholder*="ハッシュタグ"]')
      .first();

    const isVisible = await hashtagField
      .isVisible({ timeout: ACTION_TIMEOUT_MS })
      .catch(() => false);

    if (!isVisible) {
      // ハッシュタグ入力欄が公開設定画面側にしかない場合はスキップし、
      // 下書き保存自体は継続する（ユーザーが手動公開時に設定可能）。
      return;
    }

    for (const tag of cleaned) {
      await hashtagField.fill(tag);
      await hashtagField.press("Enter");
    }
  }

  private async saveDraft(page: Page): Promise<string | undefined> {
    const saveButton = page
      .getByRole("button", { name: /下書き保存/ })
      .first();

    await saveButton.waitFor({ state: "visible", timeout: ACTION_TIMEOUT_MS });
    await saveButton.click();

    // 保存完了後、URLが記事編集画面（/notes/{key}/edit 等）に変わるのを待つ。
    await page
      .waitForURL(/\/notes\//, { timeout: ACTION_TIMEOUT_MS })
      .catch(() => undefined);

    return page.url();
  }
}
