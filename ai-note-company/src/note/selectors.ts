import type { Locator, Page } from "playwright";

/**
 * ============================================================
 *  note.com UI SELECTORS — the ONLY place that knows note's DOM.
 * ============================================================
 * When note changes its UI, fix this file only.
 *
 * Rules:
 *  - No fixed-coordinate clicks. Ever.
 *  - Prefer getByRole / getByLabel / getByPlaceholder / getByText / data-testid.
 *  - Each element has several candidates, tried in order; the first visible
 *    one wins. Add a new candidate at the top when the UI changes.
 *  - We drive the public browser UI only; we do not call note's private APIs.
 *
 * `npm run login` then `npx tsx src/cli/index.ts check-selectors` reports which
 * candidates currently resolve on the live site.
 */

export type Root = Page | Locator;
export type Candidate = (root: Root) => Locator;

export interface SelectorDef {
  /** Human readable name shown in errors / check-selectors. */
  name: string;
  candidates: Candidate[];
}

const def = (name: string, ...candidates: Candidate[]): SelectorDef => ({ name, candidates });

export const NOTE_PATHS = {
  home: "/",
  login: "/login",
  newNote: "/notes/new",
  /** Requires login → used both for auth detection and analytics. */
  stats: "/sitesettings/stats",
} as const;

/** URL patterns (not selectors, but equally UI-dependent). */
export const NOTE_URL_PATTERNS = {
  loginPage: /\/login(\?|$|\/)/,
  editor: /\/notes\/(n[0-9a-z]+)\/edit/,
  publishSettings: /\/notes\/(n[0-9a-z]+)\/publish/,
  /** Public article URL: https://note.com/<urlname>/n/<key> (host-agnostic for local UI tests) */
  article: /https?:\/\/[^/\s]+\/[A-Za-z0-9_-]+\/n\/(n[0-9a-z]+)/,
} as const;

export const SELECTORS = {
  auth: {
    /** Something only a logged-in user sees. */
    loggedInIndicator: def(
      "auth.loggedInIndicator",
      (r) => r.getByRole("button", { name: /アカウント|メニュー|ユーザー/ }),
      (r) => r.getByRole("link", { name: /投稿|ダッシュボード/ }),
      (r) => r.locator('[data-testid="header-user-icon"], .o-navbarPrimary__userIcon, img[alt*="アイコン"]'),
    ),
    loginForm: def(
      "auth.loginForm",
      (r) => r.getByRole("button", { name: /^ログイン$/ }),
      (r) => r.locator('input[type="password"]'),
    ),
  },

  editor: {
    titleInput: def(
      "editor.titleInput",
      (r) => r.getByPlaceholder("記事タイトル"),
      (r) => r.getByRole("textbox", { name: /タイトル/ }),
      (r) => r.locator('textarea[placeholder*="タイトル"]'),
    ),
    bodyEditor: def(
      "editor.bodyEditor",
      (r) => r.locator('.ProseMirror[contenteditable="true"]'),
      (r) => r.getByRole("textbox", { name: /本文|ご自由にお書きください/ }),
      (r) => r.locator('[contenteditable="true"][role="textbox"]'),
    ),
    saveDraftButton: def(
      "editor.saveDraftButton",
      (r) => r.getByRole("button", { name: /下書き保存/ }),
      (r) => r.getByText("下書き保存", { exact: true }),
    ),
    draftSavedIndicator: def(
      "editor.draftSavedIndicator",
      (r) => r.getByText(/下書きを保存しました|保存しました|保存済み/),
    ),
    proceedToPublishButton: def(
      "editor.proceedToPublishButton",
      (r) => r.getByRole("button", { name: /公開に進む/ }),
      (r) => r.getByRole("button", { name: /^公開設定$/ }),
    ),
    coverImageButton: def(
      "editor.coverImageButton",
      (r) => r.getByRole("button", { name: /画像を追加|見出し画像/ }),
      (r) => r.getByLabel(/画像を追加|見出し画像/),
    ),
    coverUploadMenuItem: def(
      "editor.coverUploadMenuItem",
      (r) => r.getByRole("button", { name: /画像をアップロード/ }),
      (r) => r.getByText("画像をアップロード", { exact: true }),
    ),
    cropSaveButton: def(
      "editor.cropSaveButton",
      (r) => r.getByRole("dialog").getByRole("button", { name: /^保存$|^適用$|^完了$/ }),
      (r) => r.getByRole("button", { name: /^保存$/ }),
    ),
  },

  publish: {
    tagInput: def(
      "publish.tagInput",
      (r) => r.getByPlaceholder(/ハッシュタグ/),
      (r) => r.getByRole("combobox", { name: /ハッシュタグ|タグ/ }),
      (r) => r.locator('input[placeholder*="タグ"]'),
    ),
    paidOption: def(
      "publish.paidOption",
      (r) => r.getByRole("radio", { name: /^有料$/ }),
      (r) => r.getByLabel(/^有料$/),
      (r) => r.getByText("有料", { exact: true }),
    ),
    freeOption: def(
      "publish.freeOption",
      (r) => r.getByRole("radio", { name: /^無料$/ }),
      (r) => r.getByLabel(/^無料$/),
    ),
    priceInput: def(
      "publish.priceInput",
      (r) => r.getByLabel(/価格/),
      (r) => r.getByPlaceholder(/価格|円/),
      (r) => r.locator('input[name="price"], input[type="number"]'),
    ),
    paidAreaButton: def(
      "publish.paidAreaButton",
      (r) => r.getByRole("button", { name: /有料エリア設定/ }),
      (r) => r.getByText(/有料エリア設定/),
    ),
    /** Repeated "move the paid line here" buttons, one per paragraph. */
    paidLineButtons: def(
      "publish.paidLineButtons",
      (r) => r.getByRole("button", { name: /ラインをこの場所に変更/ }),
    ),
    publishButton: def(
      "publish.publishButton",
      (r) => r.getByRole("button", { name: /^投稿する$|^公開する$/ }),
    ),
    completionArticleLink: def(
      "publish.completionArticleLink",
      (r) => r.getByRole("dialog").locator('a[href*="/n/n"]'),
      (r) => r.locator('a[href^="https://note.com/"][href*="/n/n"]'),
    ),
  },

  common: {
    errorMessage: def(
      "common.errorMessage",
      (r) => r.getByRole("alert"),
      (r) => r.locator('[class*="error" i]:visible'),
    ),
  },

  stats: {
    /** Column headers of the per-article table (used to map ビュー/コメント/スキ). */
    columnHeaders: def(
      "stats.columnHeaders",
      (r) => r.getByRole("columnheader"),
      (r) => r.locator("table th"),
    ),
    /** Cells inside one row. */
    rowCells: def(
      "stats.rowCells",
      (r) => r.getByRole("cell"),
      (r) => r.locator("td"),
    ),
    /** Rows of the per-article table on /sitesettings/stats. */
    articleRows: def(
      "stats.articleRows",
      (r) => r.getByRole("row"),
      (r) => r.locator('[class*="stats" i] li, table tr'),
    ),
  },

  article: {
    likeButton: def(
      "article.likeButton",
      (r) => r.getByRole("button", { name: /スキ/ }),
    ),
    commentHeading: def(
      "article.commentHeading",
      (r) => r.getByText(/コメント\s*\d+|\d+\s*件のコメント/),
    ),
  },

  research: {
    /** Article title links on public pages (titles only, never body text). */
    articleLinks: def(
      "research.articleLinks",
      (r) => r.locator('a[href*="/n/n"]'),
    ),
  },
} as const;
