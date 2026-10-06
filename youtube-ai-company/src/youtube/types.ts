export interface TrendingVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number | null;
  commentCount: number | null;
  durationSec: number;
  url: string;
  /** views per hour since publish — a simple "growth velocity" signal */
  viewsPerHour: number;
}

export interface UploadRequest {
  filePath: string | null;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: "private" | "unlisted" | "public";
  categoryId: string;
  /** Required by YouTube; this system never targets children. */
  madeForKids: false;
  containsSyntheticMedia: boolean;
}

export interface UploadResult {
  youtubeVideoId: string;
  url: string;
  privacyStatus: string;
}

/** Metrics are optional: anything the API cannot provide stays undefined and is listed in `unavailable`. */
export interface VideoMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  subscribersGained?: number;
  averageViewDurationSec?: number;
  averageViewPercentage?: number;
  estimatedMinutesWatched?: number;
  impressions?: number;
  ctr?: number;
}

export interface RetentionPoint {
  /** 0..1 position in the video */
  ratio: number;
  /** share of viewers still watching (audienceWatchRatio) */
  watchRatio: number;
}

export interface MetricsResult {
  metrics: VideoMetrics;
  unavailable: (keyof VideoMetrics | "retention")[];
  retention: RetentionPoint[] | null;
  source: "mock" | "youtube" | "manual";
}

export interface YouTubeProvider {
  readonly name: "mock" | "youtube";
  readonly isMock: boolean;
  searchTrendingShorts(query: string, opts: { regionCode: string; maxResults: number; publishedAfter: Date }): Promise<TrendingVideo[]>;
  getTopComments(videoId: string, max: number): Promise<string[]>;
  uploadVideo(req: UploadRequest): Promise<UploadResult>;
  getVideoMetrics(youtubeVideoId: string, opts: { startDate: string; endDate: string; context?: MockMetricsHint }): Promise<MetricsResult>;
}

/** Hints the mock uses to simulate realistic (but fake) performance. Ignored by the real provider. */
export interface MockMetricsHint {
  durationSec?: number;
  hookStyle?: "question" | "conclusion" | "other";
  confidence?: number;
}
