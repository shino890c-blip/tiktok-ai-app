import { createHash } from "node:crypto";
import type { Clock } from "../core/clock.js";
import { systemClock } from "../core/clock.js";
import { NonRetryableError } from "../core/errors.js";
import type { MetricsResult, MockMetricsHint, TrendingVideo, UploadRequest, UploadResult, YouTubeProvider } from "./types.js";

function rand(seed: string): () => number {
  let h = parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
  return () => {
    // mulberry32
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_TITLES = [
  "9割が知らない〇〇の正しいやり方",
  "これやめたら毎日がラクになった",
  "実は逆効果だった生活習慣",
  "1分で分かる△△の仕組み",
  "プロが絶対にやらないNG行動",
  "今日から使える小ワザ3選",
];

/**
 * Offline YouTube simulation. All IDs are prefixed with `mock_`, all URLs use mock://,
 * and nothing leaves the process. Used when MOCK_MODE=true or YOUTUBE_PROVIDER=mock.
 */
export class MockYouTubeProvider implements YouTubeProvider {
  readonly name = "mock" as const;
  readonly isMock = true;
  readonly uploads: (UploadRequest & { youtubeVideoId: string })[] = [];
  /** Test hook: force the next N uploads to fail. */
  failNextUploads = 0;

  constructor(private readonly clock: Clock = systemClock) {}

  async searchTrendingShorts(query: string, opts: { maxResults: number; publishedAfter: Date }): Promise<TrendingVideo[]> {
    const r = rand(`${query}:${opts.publishedAfter.toISOString().slice(0, 10)}`);
    const now = this.clock.now().getTime();
    return Array.from({ length: Math.min(opts.maxResults, SAMPLE_TITLES.length) }, (_, i) => {
      const hours = 6 + Math.floor(r() * 160);
      const views = Math.floor(20_000 + r() * 2_000_000);
      const id = `mock_trend_${i}_${Math.floor(r() * 1e6)}`;
      return {
        videoId: id,
        title: `${SAMPLE_TITLES[i]}【${query}】`,
        channelTitle: `サンプルチャンネル${i + 1}`,
        publishedAt: new Date(now - hours * 3_600_000).toISOString(),
        viewCount: views,
        likeCount: Math.floor(views * (0.02 + r() * 0.05)),
        commentCount: Math.floor(views * (0.001 + r() * 0.004)),
        durationSec: 15 + Math.floor(r() * 45),
        url: `mock://youtube/shorts/${id}`,
        viewsPerHour: Math.round(views / hours),
      };
    }).sort((a, b) => b.viewsPerHour - a.viewsPerHour);
  }

  async getTopComments(videoId: string, max: number): Promise<string[]> {
    const pool = ["知らなかった！", "保存しました", "これ毎日やってた…", "もっと詳しく知りたい", "理由まで分かって助かる", "本当に効果ある？"];
    const r = rand(videoId);
    return pool.filter(() => r() > 0.4).slice(0, max);
  }

  async uploadVideo(req: UploadRequest): Promise<UploadResult> {
    if (this.failNextUploads > 0) {
      this.failNextUploads--;
      throw new NonRetryableError("Mock upload failure (simulated)", "MOCK_UPLOAD_FAILED");
    }
    const youtubeVideoId = `mock_${createHash("sha256").update(req.title + this.uploads.length + this.clock.now().toISOString()).digest("hex").slice(0, 11)}`;
    this.uploads.push({ ...req, youtubeVideoId });
    return { youtubeVideoId, url: `mock://youtube/shorts/${youtubeVideoId}`, privacyStatus: req.privacyStatus };
  }

  async getVideoMetrics(youtubeVideoId: string, opts: { context?: MockMetricsHint }): Promise<MetricsResult> {
    const r = rand(youtubeVideoId);
    const hint = opts.context ?? {};
    const duration = hint.durationSec ?? 30;
    // Simulated effects so experiments produce meaningful comparisons.
    let quality = 0.45 + r() * 0.3 + (hint.confidence ?? 0.7) * 0.1;
    if (hint.hookStyle === "question") quality += 0.05;
    if (duration <= 25) quality += 0.04;
    if (duration > 45) quality -= 0.08;
    quality = Math.max(0.1, Math.min(0.95, quality));
    const views = Math.floor(800 + quality * quality * 40_000);
    const avgPct = Math.min(0.98, 0.35 + quality * 0.6);
    const retention = Array.from({ length: 11 }, (_, i) => {
      const ratio = i / 10;
      const watch = i === 0 ? 1 : Math.max(0.05, Math.min(1, avgPct + 0.35 * (1 - ratio) - 0.18 - r() * 0.04));
      return { ratio, watchRatio: Number(watch.toFixed(3)) };
    });
    return {
      source: "mock",
      metrics: {
        views,
        likes: Math.floor(views * (0.02 + quality * 0.04)),
        comments: Math.floor(views * 0.002),
        shares: Math.floor(views * 0.004 * quality),
        subscribersGained: Math.floor(views * 0.001 * quality * 3),
        averageViewDurationSec: Number((duration * avgPct).toFixed(1)),
        averageViewPercentage: Number((avgPct * 100).toFixed(1)),
        estimatedMinutesWatched: Math.round((views * duration * avgPct) / 60),
      },
      // The real Analytics API does not expose impressions/CTR, so the mock doesn't invent them either.
      unavailable: ["impressions", "ctr"],
      retention,
    };
  }
}
