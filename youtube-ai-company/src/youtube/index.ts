import type { AppConfig } from "../config/index.js";
import type { Clock } from "../core/clock.js";
import type { Repositories } from "../database/repositories.js";
import type { Logger } from "../logging/logger.js";
import { GoogleYouTubeProvider } from "./google.js";
import { MockYouTubeProvider } from "./mock.js";
import { GoogleOAuthClient } from "./oauth.js";
import { QuotaGuard } from "./quota.js";
import type { YouTubeProvider } from "./types.js";

export * from "./types.js";
export { MockYouTubeProvider } from "./mock.js";
export { GoogleOAuthClient } from "./oauth.js";

export function createYouTubeProvider(config: AppConfig, deps: { repos: Repositories; clock: Clock; logger: Logger }): YouTubeProvider {
  if (config.youtube.provider === "mock") return new MockYouTubeProvider(deps.clock);
  const { youtube } = config;
  const oauth =
    youtube.clientId && youtube.clientSecret
      ? new GoogleOAuthClient({
          clientId: youtube.clientId,
          clientSecret: youtube.clientSecret,
          redirectUri: youtube.redirectUri,
          tokenPath: youtube.tokenPath,
        })
      : undefined;
  return new GoogleYouTubeProvider({
    apiKey: youtube.apiKey,
    oauth,
    quota: new QuotaGuard(deps.repos.apiUsage, deps.clock, youtube.dailyQuotaUnits, youtube.minRequestIntervalMs),
    logger: deps.logger.child({ agent: "youtube" }),
    uploadEnabled: youtube.uploadEnabled,
    retries: config.pipeline.maxRetries,
    baseDelayMs: Math.max(1000, config.pipeline.retryBaseDelayMs),
  });
}
