import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../../config";
import type { KnowledgeSummary } from "../../knowledge/knowledgeBase";
import type { TrendSignal } from "../../prompts";
import { errorMessage } from "../../utils";

export interface SourceResult {
  source: string;
  ok: boolean;
  signals: TrendSignal[];
  error?: string;
  skipped?: string;
}

export interface TrendSource {
  readonly name: string;
  fetch(): Promise<SourceResult>;
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function parseRssItems(xml: string, limit = 20): { title: string; link?: string; traffic?: string }[] {
  const items: { title: string; link?: string; traffic?: string }[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && items.length < limit) {
    const body = m[1];
    const title = /<title>([\s\S]*?)<\/title>/.exec(body)?.[1];
    if (!title) continue;
    items.push({
      title: decode(title),
      link: decode(/<link>([\s\S]*?)<\/link>/.exec(body)?.[1] ?? "") || undefined,
      traffic: decode(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/.exec(body)?.[1] ?? "") || undefined,
    });
  }
  return items;
}

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "ai-note-company/0.1 (+research)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

class RssSource implements TrendSource {
  constructor(readonly name: string, private readonly url: string, private readonly limit = 15) {}
  async fetch(): Promise<SourceResult> {
    try {
      const items = parseRssItems(await fetchText(this.url), this.limit);
      return { source: this.name, ok: true, signals: items.map((i) => ({ source: this.name, title: i.title, url: i.link, metric: i.traffic ? `検索数 ${i.traffic}` : undefined })) };
    } catch (e) {
      return { source: this.name, ok: false, signals: [], error: errorMessage(e) };
    }
  }
}

/** YouTube Data API v3 (official). Skipped without YOUTUBE_API_KEY. */
class YouTubeSource implements TrendSource {
  readonly name = "youtube";
  constructor(private readonly apiKey: string) {}
  async fetch(): Promise<SourceResult> {
    if (!this.apiKey) return { source: this.name, ok: false, signals: [], skipped: "YOUTUBE_API_KEY 未設定" };
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=JP&maxResults=15&key=${encodeURIComponent(this.apiKey)}`;
      const json = JSON.parse(await fetchText(url)) as { items?: { id: string; snippet: { title: string }; statistics?: { viewCount?: string } }[] };
      return {
        source: this.name,
        ok: true,
        signals: (json.items ?? []).map((v) => ({
          source: this.name,
          title: v.snippet.title,
          url: `https://www.youtube.com/watch?v=${v.id}`,
          metric: v.statistics?.viewCount ? `再生 ${v.statistics.viewCount}` : undefined,
        })),
      };
    } catch (e) {
      return { source: this.name, ok: false, signals: [], error: errorMessage(e).replace(this.apiKey, "***") };
    }
  }
}

/**
 * Human-curated signals: X trends, reader worries, competitor observations.
 * X has no free official trends API, so this file is the supported path.
 */
class ManualSource implements TrendSource {
  readonly name = "manual";
  constructor(private readonly file: string) {}
  async fetch(): Promise<SourceResult> {
    if (!fs.existsSync(this.file)) return { source: this.name, ok: false, signals: [], skipped: `${path.basename(this.file)} なし` };
    try {
      const data = JSON.parse(fs.readFileSync(this.file, "utf8")) as { signals?: TrendSignal[] };
      return { source: this.name, ok: true, signals: (data.signals ?? []).filter((s) => s && s.title) };
    } catch (e) {
      return { source: this.name, ok: false, signals: [], error: errorMessage(e) };
    }
  }
}

/** Public note.com pages read via the browser UI (titles only — never body copy). */
class NoteBrowseSource implements TrendSource {
  readonly name = "note";
  constructor(private readonly config: AppConfig) {}
  async fetch(): Promise<SourceResult> {
    try {
      const { collectNoteTrendTitles } = await import("../../note/browser/noteTrends");
      const titles = await collectNoteTrendTitles(this.config);
      return { source: this.name, ok: true, signals: titles.map((t) => ({ source: this.name, title: t.title, url: t.url })) };
    } catch (e) {
      return { source: this.name, ok: false, signals: [], error: errorMessage(e) };
    }
  }
}

class OwnArticlesSource implements TrendSource {
  readonly name = "own_articles";
  constructor(private readonly knowledge: KnowledgeSummary) {}
  async fetch(): Promise<SourceResult> {
    return {
      source: this.name,
      ok: true,
      signals: this.knowledge.top_topics.map((t) => ({ source: this.name, title: t.topic, metric: `performance ${t.performance_score}` })),
    };
  }
}

class MockSource implements TrendSource {
  readonly name = "mock";
  async fetch(): Promise<SourceResult> {
    return {
      source: this.name,
      ok: true,
      signals: [
        { source: "mock", title: "生成AI 副業 時短", metric: "シミュレーション" },
        { source: "mock", title: "新NISA 初心者 やめたほうがいいこと", metric: "シミュレーション" },
        { source: "mock", title: "在宅ワーク 集中力 朝", metric: "シミュレーション" },
      ],
    };
  }
}

export function buildSources(config: AppConfig, knowledge: KnowledgeSummary): TrendSource[] {
  const sources: TrendSource[] = [new OwnArticlesSource(knowledge), new ManualSource(path.join(config.dataDir, "manual-trends.json"))];
  if (config.runMode === "mock") sources.push(new MockSource());
  if (config.research.fetchRss) {
    sources.push(new RssSource("google_trends", "https://trends.google.co.jp/trending/rss?geo=JP"));
    sources.push(new RssSource("news", "https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja"));
  }
  sources.push(new YouTubeSource(config.research.youtubeApiKey));
  if (config.research.noteBrowse && config.runMode === "live") sources.push(new NoteBrowseSource(config));
  return sources;
}
