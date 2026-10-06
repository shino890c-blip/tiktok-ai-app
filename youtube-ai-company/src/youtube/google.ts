import { readFile, stat } from "node:fs/promises";
import { ConfigError, ExternalApiError, NonRetryableError, PublishUnknownStateError, TimeoutError } from "../core/errors.js";
import { withBackoff } from "../core/retry.js";
import type { Logger } from "../logging/logger.js";
import type { GoogleOAuthClient } from "./oauth.js";
import type { QuotaGuard, QuotaOperation } from "./quota.js";
import type { MetricsResult, RetentionPoint, TrendingVideo, UploadRequest, UploadResult, VideoMetrics, YouTubeProvider } from "./types.js";

const DATA_API = "https://www.googleapis.com/youtube/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3/videos";
const ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2/reports";

export function parseIsoDuration(iso: string): number {
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, d, h, mi, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0);
}

export interface GoogleYouTubeOptions {
  apiKey?: string;
  oauth?: GoogleOAuthClient;
  quota: QuotaGuard;
  logger: Logger;
  uploadEnabled: boolean;
  retries: number;
  baseDelayMs: number;
  fetchImpl?: typeof fetch;
}

/**
 * Real YouTube Data API v3 + YouTube Analytics API v2 client (REST, no SDK dependency).
 * - Research uses an API key (public data) or OAuth.
 * - Upload/Analytics require OAuth (`npm run youtube:auth`).
 * - Every call goes through QuotaGuard; transient errors use exponential backoff.
 */
export class GoogleYouTubeProvider implements YouTubeProvider {
  readonly name = "youtube" as const;
  readonly isMock = false;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GoogleYouTubeOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async authHeaders(requireOAuth: boolean): Promise<Record<string, string>> {
    if (this.opts.oauth && (requireOAuth || !this.opts.apiKey)) {
      return { authorization: `Bearer ${await this.opts.oauth.getAccessToken()}` };
    }
    if (requireOAuth) throw new ConfigError("This operation needs OAuth (YOUTUBE_CLIENT_ID/SECRET + `npm run youtube:auth`)");
    return {};
  }

  private async getJson(op: QuotaOperation, url: URL, requireOAuth = false): Promise<Record<string, unknown>> {
    return withBackoff(
      async () => {
        await this.opts.quota.acquire(op);
        const headers = await this.authHeaders(requireOAuth);
        if (!headers.authorization && this.opts.apiKey) url.searchParams.set("key", this.opts.apiKey);
        let res: Response;
        try {
          res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(30_000) });
        } catch (err) {
          throw new ExternalApiError(`YouTube network error: ${(err as Error).message}`, undefined, true);
        }
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          const reason = JSON.stringify((body.error as Record<string, unknown> | undefined)?.message ?? body).slice(0, 300);
          const quotaHit = res.status === 403 && reason.includes("quota");
          throw new ExternalApiError(`YouTube API ${res.status}: ${reason}`, res.status, !quotaHit && (res.status === 429 || res.status >= 500));
        }
        return body;
      },
      {
        retries: this.opts.retries,
        baseDelayMs: this.opts.baseDelayMs,
        onRetry: (err, n, delay) => this.opts.logger.warn("youtube.retry", `Retry ${n} in ${delay}ms`, { error: String(err) }),
      },
    );
  }

  async searchTrendingShorts(
    query: string,
    opts: { regionCode: string; maxResults: number; publishedAfter: Date },
  ): Promise<TrendingVideo[]> {
    const search = new URL(`${DATA_API}/search`);
    search.search = new URLSearchParams({
      part: "snippet",
      type: "video",
      videoDuration: "short",
      order: "viewCount",
      q: `${query} #shorts`,
      regionCode: opts.regionCode,
      maxResults: String(Math.min(25, opts.maxResults)),
      publishedAfter: opts.publishedAfter.toISOString(),
    }).toString();
    const found = await this.getJson("search.list", search);
    const ids = ((found.items as { id?: { videoId?: string } }[]) ?? []).map((i) => i.id?.videoId).filter(Boolean) as string[];
    if (!ids.length) return [];

    const details = new URL(`${DATA_API}/videos`);
    details.search = new URLSearchParams({ part: "snippet,statistics,contentDetails", id: ids.join(",") }).toString();
    const data = await this.getJson("videos.list", details);
    const now = Date.now();
    return ((data.items as Record<string, any>[]) ?? []).map((v) => {
      const views = Number(v.statistics?.viewCount ?? 0);
      const publishedAt = String(v.snippet?.publishedAt ?? new Date().toISOString());
      const hours = Math.max(1, (now - new Date(publishedAt).getTime()) / 3_600_000);
      return {
        videoId: String(v.id),
        title: String(v.snippet?.title ?? ""),
        channelTitle: String(v.snippet?.channelTitle ?? ""),
        publishedAt,
        viewCount: views,
        likeCount: v.statistics?.likeCount !== undefined ? Number(v.statistics.likeCount) : null,
        commentCount: v.statistics?.commentCount !== undefined ? Number(v.statistics.commentCount) : null,
        durationSec: parseIsoDuration(String(v.contentDetails?.duration ?? "")),
        url: `https://www.youtube.com/shorts/${String(v.id)}`,
        viewsPerHour: Math.round(views / hours),
      };
    });
  }

  async getTopComments(videoId: string, max: number): Promise<string[]> {
    const url = new URL(`${DATA_API}/commentThreads`);
    url.search = new URLSearchParams({ part: "snippet", videoId, order: "relevance", maxResults: String(Math.min(20, max)), textFormat: "plainText" }).toString();
    try {
      const data = await this.getJson("commentThreads.list", url);
      return ((data.items as Record<string, any>[]) ?? [])
        .map((i) => String(i.snippet?.topLevelComment?.snippet?.textDisplay ?? ""))
        .filter(Boolean)
        .slice(0, max);
    } catch (err) {
      // Comments may be disabled; that's not fatal for research.
      if (err instanceof ExternalApiError && err.status === 403) return [];
      throw err;
    }
  }

  async uploadVideo(req: UploadRequest): Promise<UploadResult> {
    if (!this.opts.uploadEnabled) {
      throw new NonRetryableError("Real upload is disabled. Set YOUTUBE_UPLOAD_ENABLED=true to allow uploads.", "UPLOAD_DISABLED");
    }
    if (!req.filePath) throw new NonRetryableError("No video file attached to this video (video_file_path is empty)", "NO_VIDEO_FILE");
    const info = await stat(req.filePath).catch(() => null);
    if (!info || !info.isFile() || info.size === 0) throw new NonRetryableError(`Video file not found or empty: ${req.filePath}`, "NO_VIDEO_FILE");

    // Step 1: open a resumable session. Nothing exists on YouTube yet, so retrying is safe.
    const sessionUrl = await withBackoff(
      async () => {
        await this.opts.quota.acquire("videos.insert");
        const headers = await this.authHeaders(true);
        const res = await this.fetchImpl(`${UPLOAD_API}?uploadType=resumable&part=snippet,status`, {
          method: "POST",
          headers: {
            ...headers,
            "content-type": "application/json; charset=UTF-8",
            "x-upload-content-type": "video/*",
            "x-upload-content-length": String(info.size),
          },
          body: JSON.stringify({
            snippet: { title: req.title, description: req.description, tags: req.tags, categoryId: req.categoryId },
            status: {
              privacyStatus: req.privacyStatus,
              selfDeclaredMadeForKids: req.madeForKids,
              containsSyntheticMedia: req.containsSyntheticMedia,
            },
          }),
          signal: AbortSignal.timeout(30_000),
        }).catch((err: Error) => {
          throw new ExternalApiError(`Upload session network error: ${err.message}`, undefined, true);
        });
        if (!res.ok) {
          const text = await res.text();
          throw new ExternalApiError(`Upload session failed ${res.status}: ${text.slice(0, 300)}`, res.status, res.status >= 500 || res.status === 429);
        }
        const location = res.headers.get("location");
        if (!location) throw new ExternalApiError("Upload session returned no Location header", res.status, true);
        return location;
      },
      { retries: this.opts.retries, baseDelayMs: this.opts.baseDelayMs },
    );

    // Step 2: send bytes. A failure here may or may not have created the video -> unknown state, never auto-retry.
    let res: Response;
    try {
      res = await this.fetchImpl(sessionUrl, {
        method: "PUT",
        headers: { "content-type": "video/*", "content-length": String(info.size) },
        body: await readFile(req.filePath),
        signal: AbortSignal.timeout(30 * 60_000),
      });
    } catch (err) {
      const e = err as Error;
      throw new PublishUnknownStateError(
        `Upload interrupted (${e.name === "TimeoutError" ? "timeout" : e.message}). The video may exist on YouTube — check YouTube Studio before retrying.`,
        { sessionUrl: "redacted" },
      );
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !body.id) {
      if (res.status >= 400 && res.status < 500) {
        throw new NonRetryableError(`Upload rejected ${res.status}: ${JSON.stringify(body).slice(0, 300)}`, "UPLOAD_REJECTED");
      }
      throw new PublishUnknownStateError(`Upload finished with status ${res.status} and no video id. Check YouTube Studio.`);
    }
    const status = body.status as { privacyStatus?: string } | undefined;
    return {
      youtubeVideoId: String(body.id),
      url: `https://www.youtube.com/shorts/${String(body.id)}`,
      privacyStatus: status?.privacyStatus ?? req.privacyStatus,
    };
  }

  async getVideoMetrics(youtubeVideoId: string, opts: { startDate: string; endDate: string }): Promise<MetricsResult> {
    const wanted = ["views", "likes", "comments", "shares", "subscribersGained", "averageViewDuration", "averageViewPercentage", "estimatedMinutesWatched"];
    const url = new URL(ANALYTICS_API);
    url.search = new URLSearchParams({
      ids: "channel==MINE",
      startDate: opts.startDate,
      endDate: opts.endDate,
      metrics: wanted.join(","),
      filters: `video==${youtubeVideoId}`,
    }).toString();
    const data = await this.getJson("analytics", url, true);
    const headers = ((data.columnHeaders as { name: string }[]) ?? []).map((h) => h.name);
    const row = ((data.rows as number[][]) ?? [])[0];
    const metrics: VideoMetrics = {};
    const unavailable: MetricsResult["unavailable"] = ["impressions", "ctr"];
    const map: Record<string, keyof VideoMetrics> = {
      views: "views",
      likes: "likes",
      comments: "comments",
      shares: "shares",
      subscribersGained: "subscribersGained",
      averageViewDuration: "averageViewDurationSec",
      averageViewPercentage: "averageViewPercentage",
      estimatedMinutesWatched: "estimatedMinutesWatched",
    };
    for (const [apiName, key] of Object.entries(map)) {
      const idx = headers.indexOf(apiName);
      if (row && idx >= 0 && typeof row[idx] === "number") metrics[key] = row[idx];
      else unavailable.push(key);
    }

    let retention: RetentionPoint[] | null = null;
    try {
      const rUrl = new URL(ANALYTICS_API);
      rUrl.search = new URLSearchParams({
        ids: "channel==MINE",
        startDate: opts.startDate,
        endDate: opts.endDate,
        metrics: "audienceWatchRatio",
        dimensions: "elapsedVideoTimeRatio",
        filters: `video==${youtubeVideoId}`,
      }).toString();
      const r = await this.getJson("analytics", rUrl, true);
      const rows = (r.rows as number[][]) ?? [];
      retention = rows.length ? rows.map(([ratio, watch]) => ({ ratio: Number(ratio), watchRatio: Number(watch) })) : null;
    } catch (err) {
      if (err instanceof TimeoutError) throw err;
      this.opts.logger.warn("youtube.retention_unavailable", "Retention report unavailable", { error: String(err) });
    }
    if (!retention) unavailable.push("retention");
    return { metrics, unavailable, retention, source: "youtube" };
  }
}
