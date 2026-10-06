import type { AppConfig } from "../../config";
import { SELECTORS, NOTE_URL_PATTERNS } from "../selectors";
import { launchBrowser } from "./browser";

/**
 * Reads public article *titles* from note.com's top page through the normal UI.
 * Used only as a trend signal; article bodies are never collected or copied.
 */
export async function collectNoteTrendTitles(config: AppConfig, limit = 20): Promise<{ title: string; url: string }[]> {
  const s = await launchBrowser(config, { headless: true, withStorage: false });
  try {
    await s.page.goto(config.note.baseUrl + "/", { waitUntil: "domcontentloaded" });
    await s.page.waitForTimeout(2000);
    const links = SELECTORS.research.articleLinks.candidates[0](s.page);
    const n = Math.min(await links.count(), 80);
    const out = new Map<string, string>();
    for (let i = 0; i < n && out.size < limit; i++) {
      const a = links.nth(i);
      const href = (await a.getAttribute("href")) ?? "";
      const text = ((await a.innerText().catch(() => "")) || "").split("\n")[0].trim();
      const url = href.startsWith("http") ? href : config.note.baseUrl + href;
      if (text.length >= 8 && NOTE_URL_PATTERNS.article.test(url)) out.set(url, text.slice(0, 80));
    }
    return [...out.entries()].map(([url, title]) => ({ url, title }));
  } finally {
    await s.close();
  }
}
