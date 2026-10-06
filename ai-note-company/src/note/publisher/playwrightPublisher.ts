import fs from "node:fs";
import type { Page } from "playwright";
import type { AppConfig } from "../../config";
import type { Logger } from "../../logger";
import { AuthRequiredError, isLoggedIn, saveStorageState } from "../auth/auth";
import { launchBrowser, type BrowserSession } from "../browser/browser";
import { findFirst, SelectorNotFoundError, tryFind } from "../browser/resolve";
import { NOTE_PATHS, NOTE_URL_PATTERNS, SELECTORS } from "../selectors";
import { markdownToHtml } from "./markdownToHtml";
import { PublishUnverifiedError, type DraftResult, type NotePostInput, type NotePublisher, type PublishResult } from "./types";

/**
 * Drives note.com's normal editor UI with Playwright.
 * - Uses the human-created session in .auth/note-storage.json (never a password).
 * - All DOM knowledge lives in src/note/selectors.ts.
 * - When anything looks unexpected it stops instead of pushing on.
 */
export class PlaywrightNotePublisher implements NotePublisher {
  readonly name = "playwright";
  readonly isMock = false;

  constructor(private readonly config: AppConfig, private readonly logger: Logger) {}

  private async open(): Promise<BrowserSession> {
    if (!fs.existsSync(this.config.note.storageStatePath)) throw new AuthRequiredError();
    const s = await launchBrowser(this.config);
    if (!(await isLoggedIn(s.page, this.config))) {
      await s.close();
      throw new AuthRequiredError();
    }
    return s;
  }

  async saveDraft(input: NotePostInput, editUrl?: string | null): Promise<DraftResult> {
    const s = await this.open();
    const warnings: string[] = [];
    try {
      const { page } = s;
      await page.goto(editUrl ?? this.config.note.baseUrl + NOTE_PATHS.newNote, { waitUntil: "domcontentloaded" });
      await page.waitForURL(NOTE_URL_PATTERNS.editor, { timeout: 30000 }).catch(() => {
        throw new SelectorNotFoundError("editor URL", `現在のURL: ${page.url()}`);
      });

      const title = await findFirst(page, SELECTORS.editor.titleInput, 20000);
      await title.click();
      await title.fill(input.title);

      const markdown = input.paid_body ? `${input.free_body}\n\n${input.paid_body}` : input.free_body;
      await this.fillBody(page, markdown, !!editUrl);

      if (input.cover_image && !editUrl) {
        try {
          await this.uploadCover(page, input.cover_image);
        } catch (e) {
          warnings.push(`アイキャッチ画像をアップロードできませんでした（下書きは保存します）: ${(e as Error).message}`);
        }
      }

      const save = await findFirst(page, SELECTORS.editor.saveDraftButton);
      await save.click();
      const saved = await tryFind(page, SELECTORS.editor.draftSavedIndicator, 10000);
      if (!saved) warnings.push("「保存しました」表示を確認できませんでした。URLで下書きの存在を判定します。");
      await page.waitForTimeout(1500);

      const m = NOTE_URL_PATTERNS.editor.exec(page.url());
      if (!m) throw new SelectorNotFoundError("draft edit URL", `現在のURL: ${page.url()}`);
      await saveStorageState(s.context, this.config.note.storageStatePath);
      return { status: "DRAFT", edit_url: page.url(), note_key: m[1] ?? m[2] ?? null, is_mock: false, warnings };
    } finally {
      await s.close();
    }
  }

  /** Pastes HTML into the editor the same way a user's clipboard paste would. */
  private async fillBody(page: Page, markdown: string, replace: boolean): Promise<void> {
    const body = await findFirst(page, SELECTORS.editor.bodyEditor, 20000);
    await body.click();
    if (replace) {
      await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await page.keyboard.press("Delete");
    }
    const html = markdownToHtml(markdown);
    const plain = markdown.replace(/^#+\s+/gm, "").replace(/\*\*/g, "");
    await body.evaluate(
      (el, data) => {
        const dt = new DataTransfer();
        dt.setData("text/html", data.html);
        dt.setData("text/plain", data.plain);
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      },
      { html, plain },
    );
    await page.waitForTimeout(800);

    const probe = plain.split("\n").find((l) => l.trim().length >= 8)?.trim().slice(0, 20) ?? "";
    let text = await body.innerText();
    if (probe && !text.includes(probe)) {
      // Fallback: type paragraph by paragraph (slower, still UI-level).
      this.logger.warn("paste was not accepted by the editor; falling back to typing");
      for (const para of plain.split(/\n{2,}/)) {
        await page.keyboard.insertText(para.trim());
        await page.keyboard.press("Enter");
      }
      text = await body.innerText();
    }
    if (probe && !text.includes(probe)) throw new SelectorNotFoundError("editor.bodyEditor (本文の入力を確認できません)");
  }

  private async uploadCover(page: Page, file: string): Promise<void> {
    if (!fs.existsSync(file)) throw new Error(`cover image not found: ${file}`);
    const btn = await findFirst(page, SELECTORS.editor.coverImageButton, 5000);
    await btn.click();
    const chooserPromise = page.waitForEvent("filechooser", { timeout: 10000 });
    const upload = await tryFind(page, SELECTORS.editor.coverUploadMenuItem, 3000);
    if (upload) await upload.click();
    const chooser = await chooserPromise;
    await chooser.setFiles(file);
    const crop = await tryFind(page, SELECTORS.editor.cropSaveButton, 10000);
    if (crop) await crop.click();
    await page.waitForTimeout(1500);
  }

  async publish(input: NotePostInput, editUrl: string): Promise<PublishResult> {
    if (input.publish_mode === "DRAFT") throw new Error("DRAFT mode articles are never published.");
    const s = await this.open();
    const warnings: string[] = [];
    try {
      const { page } = s;
      await page.goto(editUrl, { waitUntil: "domcontentloaded" });
      const title = await findFirst(page, SELECTORS.editor.titleInput, 20000);
      const current = (await title.inputValue().catch(() => "")) || (await title.innerText().catch(() => ""));
      if (current.trim() !== input.title.trim()) {
        throw new SelectorNotFoundError("draft title check", `下書きのタイトルが一致しません（"${current}"）。別の記事を公開しないよう中断しました。`);
      }

      await (await findFirst(page, SELECTORS.editor.proceedToPublishButton)).click();
      await page.waitForLoadState("domcontentloaded");

      // Tags
      if (input.tags.length) {
        const tagInput = await tryFind(page, SELECTORS.publish.tagInput, 8000);
        if (!tagInput) warnings.push("タグ入力欄が見つからないためタグは未設定です。");
        else
          for (const tag of input.tags.slice(0, 10)) {
            await tagInput.fill(tag);
            await tagInput.press("Enter");
            await page.waitForTimeout(300);
          }
      }

      // Price / paid line
      const paid = input.publish_mode === "PAID" || input.publish_mode === "PARTIAL_PAID";
      if (paid) {
        await (await findFirst(page, SELECTORS.publish.paidOption)).click();
        const price = await findFirst(page, SELECTORS.publish.priceInput);
        await price.fill(String(input.price));
        const area = await tryFind(page, SELECTORS.publish.paidAreaButton, 5000);
        if (area) await area.click();
        await this.placePaidLine(page, input.free_body);
      } else {
        const free = await tryFind(page, SELECTORS.publish.freeOption, 3000);
        if (free) await free.click();
      }

      const err = await tryFind(page, SELECTORS.common.errorMessage, 1000);
      if (err) {
        const msg = (await err.innerText().catch(() => "")).trim();
        if (msg) throw new Error(`note上でエラー表示があるため公開を中断しました: ${msg}`);
      }

      const publishBtn = await findFirst(page, SELECTORS.publish.publishButton);
      // ---- point of no return: errors after this click are never auto-retried ----
      await publishBtn.click();
      let url: string | null = null;
      try {
        await page.waitForURL(NOTE_URL_PATTERNS.article, { timeout: 30000 });
        url = page.url();
      } catch {
        const link = await tryFind(page, SELECTORS.publish.completionArticleLink, 10000);
        url = link ? await link.getAttribute("href") : null;
      }
      const m = url ? NOTE_URL_PATTERNS.article.exec(url) : null;
      if (!m) throw new PublishUnverifiedError(`公開ボタン押下後に記事URLを確認できませんでした（現在のURL: ${page.url()}）。noteの管理画面で状態を確認してください。`);
      const publicUrl = m[0];

      const verify = await s.context.newPage();
      const res = await verify.goto(publicUrl, { waitUntil: "domcontentloaded" });
      const pageTitle = await verify.title();
      const visible = await verify.getByText(input.title, { exact: false }).first().isVisible().catch(() => false);
      await verify.close();
      if (!res?.ok() || !(visible || pageTitle.includes(input.title.slice(0, 15)))) {
        throw new PublishUnverifiedError(`公開URL ${publicUrl} で記事を確認できませんでした（HTTP ${res?.status()}）。`);
      }
      await saveStorageState(s.context, this.config.note.storageStatePath);
      return { status: "PUBLISHED", note_url: publicUrl, is_mock: false, warnings };
    } finally {
      await s.close();
    }
  }

  /** Clicks the "move paid line here" button that follows the last free paragraph. */
  private async placePaidLine(page: Page, freeBody: string): Promise<void> {
    const lastPara = freeBody
      .split(/\n+/)
      .map((l) => l.replace(/^#+\s+/, "").replace(/\*\*/g, "").trim())
      .filter((l) => l.length >= 6)
      .pop();
    if (!lastPara) throw new SelectorNotFoundError("paid line anchor", "無料部分の最終段落が特定できません");
    const buttons = SELECTORS.publish.paidLineButtons.candidates[0](page);
    const count = await buttons.count();
    if (!count) throw new SelectorNotFoundError(SELECTORS.publish.paidLineButtons.name);
    const needle = lastPara.slice(0, 18);
    for (let i = 0; i < count; i++) {
      const before = await buttons.nth(i).evaluate((el) => {
        let node: Element | null = el;
        for (let d = 0; d < 4 && node; d++) {
          const prev = node.previousElementSibling;
          if (prev && prev.textContent && prev.textContent.trim()) return prev.textContent;
          node = node.parentElement;
        }
        return "";
      });
      if (before.includes(needle)) {
        await buttons.nth(i).click();
        return;
      }
    }
    throw new SelectorNotFoundError("paid line position", "有料ラインを置く位置を特定できませんでした。公開は中断します。");
  }
}
