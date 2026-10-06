import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "playwright";
import type { AppConfig } from "../../config";
import type { Logger } from "../../logger";
import { launchBrowser } from "../browser/browser";
import { NOTE_PATHS, NOTE_URL_PATTERNS } from "../selectors";

export class AuthRequiredError extends Error {
  constructor() {
    super("noteにログインしていません。`npm run login` を実行して、ブラウザで人間がログインしてください。");
    this.name = "AuthRequiredError";
  }
}

/** Logged in ⇔ a login-only page does not redirect to /login. */
export async function isLoggedIn(page: Page, config: AppConfig): Promise<boolean> {
  await page.goto(config.note.baseUrl + NOTE_PATHS.stats, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);
  return !NOTE_URL_PATTERNS.loginPage.test(page.url());
}

export async function saveStorageState(context: BrowserContext, file: string): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await context.storageState({ path: file });
  fs.chmodSync(file, 0o600); // cookies are secrets
}

/**
 * Opens a visible browser on the note login page and waits for a HUMAN to log
 * in. This code never reads, types or stores a password.
 */
export async function interactiveLogin(config: AppConfig, logger: Logger): Promise<{ ok: boolean; message: string }> {
  const s = await launchBrowser(config, { headless: false, withStorage: true });
  try {
    if (await isLoggedIn(s.page, config)) {
      await saveStorageState(s.context, config.note.storageStatePath);
      return { ok: true, message: `既にログイン済みです。セッションを更新しました: ${config.note.storageStatePath}` };
    }
    await s.page.goto(config.note.baseUrl + NOTE_PATHS.login, { waitUntil: "domcontentloaded" });
    logger.info(`ブラウザでnoteにログインしてください（最大${config.note.loginTimeoutMinutes}分待機）。パスワードはこのツールに入力・保存されません。`);
    await s.page.waitForURL((u) => !NOTE_URL_PATTERNS.loginPage.test(u.toString()), {
      timeout: config.note.loginTimeoutMinutes * 60_000,
    });
    // Verify on a separate tab so we don't disturb the user's page.
    const check = await s.context.newPage();
    const ok = await isLoggedIn(check, config);
    await check.close();
    if (!ok) return { ok: false, message: "ログインを確認できませんでした。もう一度 `npm run login` を実行してください。" };
    await saveStorageState(s.context, config.note.storageStatePath);
    return { ok: true, message: `ログインを確認し、セッションを保存しました: ${config.note.storageStatePath}（Git管理外）` };
  } catch (e) {
    return { ok: false, message: `ログイン待機に失敗しました: ${(e as Error).message}` };
  } finally {
    await s.close();
  }
}
