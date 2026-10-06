import fs from "node:fs";
import type { Browser, BrowserContext, Page } from "playwright";
import type { AppConfig } from "../../config";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

/**
 * Launches Chromium. Reuses the saved storageState (note session cookies) when
 * present. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a preinstalled Chromium.
 */
export async function launchBrowser(config: AppConfig, opts: { headless?: boolean; withStorage?: boolean } = {}): Promise<BrowserSession> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: opts.headless ?? config.note.headless,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const useStorage = (opts.withStorage ?? true) && fs.existsSync(config.note.storageStatePath);
  const context = await browser.newContext({
    storageState: useStorage ? config.note.storageStatePath : undefined,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 1366, height: 900 },
  });
  context.setDefaultTimeout(20000);
  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    async close() {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}
