import type { AppConfig } from "../config";
import type { Article, ArticleMetrics, PublishedArticle } from "../types";
import { seeded } from "../utils";

export interface MetricsCollector {
  readonly name: string;
  collect(article: Article, published: PublishedArticle): Promise<ArticleMetrics>;
}

/** MOCK: deterministic simulated numbers, always flagged as simulation. */
export class SimulatedMetricsCollector implements MetricsCollector {
  readonly name = "simulation";
  async collect(article: Article): Promise<ArticleMetrics> {
    const r = seeded(article.article_id + article.title);
    const titleBoost = /[0-9０-９]/.test(article.title) ? 1.2 : 1;
    const views = Math.round((80 + r * 900) * titleBoost);
    const likes = Math.round(views * (0.02 + seeded(article.title) * 0.06));
    const comments = Math.round(likes * 0.1 * seeded("c" + article.article_id));
    const paid = article.mode === "PAID" || article.mode === "PARTIAL_PAID";
    const sales = paid ? Math.round(views * 0.01 * (0.5 + seeded("s" + article.article_id))) : 0;
    return {
      views,
      likes,
      comments,
      sales,
      revenue: paid ? sales * article.price : 0,
      follower_growth: Math.round(likes * 0.15),
      source: "simulation",
    };
  }
}

/**
 * LIVE: reads the logged-in creator dashboard (/sitesettings/stats) through the
 * UI. Anything that cannot be read is returned as null — never estimated.
 */
export class NoteStatsCollector implements MetricsCollector {
  readonly name = "note";
  constructor(private readonly config: AppConfig) {}

  async collect(article: Article, published: PublishedArticle): Promise<ArticleMetrics> {
    const { launchBrowser } = await import("../note/browser/browser");
    const { isLoggedIn, AuthRequiredError } = await import("../note/auth/auth");
    const { SELECTORS } = await import("../note/selectors");
    const { allTexts } = await import("../note/browser/resolve");
    const s = await launchBrowser(this.config);
    try {
      if (!(await isLoggedIn(s.page, this.config))) throw new AuthRequiredError();
      await s.page.waitForTimeout(2000);
      const metrics: ArticleMetrics = { views: null, likes: null, comments: null, sales: null, revenue: null, follower_growth: null, source: "note" };

      // Map column names → index from the table header if present.
      const headers = await allTexts(s.page, SELECTORS.stats.columnHeaders);
      const rows = SELECTORS.stats.articleRows.candidates[0](s.page);
      const n = await rows.count();
      const needle = article.title.slice(0, 15);
      for (let i = 0; i < n; i++) {
        const text = await rows.nth(i).innerText().catch(() => "");
        if (!text.includes(needle)) continue;
        const cells = await allTexts(rows.nth(i), SELECTORS.stats.rowCells);
        const at = (name: RegExp): number | null => {
          const idx = headers.findIndex((h) => name.test(h));
          if (idx < 0 || idx >= cells.length) return null;
          const v = Number(cells[idx].replace(/[,\s]/g, ""));
          return Number.isFinite(v) ? v : null;
        };
        metrics.views = at(/ビュー|閲覧/);
        metrics.comments = at(/コメント/);
        metrics.likes = at(/スキ/);
        break;
      }

      // Fallback for likes: the public article page's スキ button label.
      if (metrics.likes === null && /^https?:/.test(published.note_url)) {
        await s.page.goto(published.note_url, { waitUntil: "domcontentloaded" });
        const label = await s.page.getByRole("button", { name: /スキ/ }).first().innerText().catch(() => "");
        const m = /(\d[\d,]*)/.exec(label);
        if (m) metrics.likes = Number(m[1].replace(/,/g, ""));
      }
      // Sales / follower growth: not read automatically yet (see README) → stay null.
      return metrics;
    } finally {
      await s.close();
    }
  }
}

export function createMetricsCollector(config: AppConfig): MetricsCollector {
  return config.runMode === "live" ? new NoteStatsCollector(config) : new SimulatedMetricsCollector();
}
