import type { Clock } from "../core/clock.js";
import { QuotaExceededError } from "../core/errors.js";
import { sleep } from "../core/retry.js";
import type { ApiUsageRepo } from "../database/repositories.js";

/** YouTube Data API v3 quota costs (units) for the calls this system makes. */
export const QUOTA_COST = {
  "search.list": 100,
  "videos.list": 1,
  "commentThreads.list": 1,
  "videos.insert": 1600,
  analytics: 0,
} as const;

export type QuotaOperation = keyof typeof QUOTA_COST;

/**
 * Guards against excessive API access: enforces a self-imposed daily unit budget (persisted
 * in the DB so restarts don't reset it) and a minimum interval between requests.
 */
export class QuotaGuard {
  private lastRequestAt = 0;
  constructor(
    private readonly usage: ApiUsageRepo,
    private readonly clock: Clock,
    private readonly dailyUnits: number,
    private readonly minIntervalMs: number,
  ) {}

  private key(): string {
    return `youtube:${this.clock.now().toISOString().slice(0, 10)}`;
  }

  async acquire(op: QuotaOperation): Promise<void> {
    const cost = QUOTA_COST[op];
    const used = await this.usage.get(this.key());
    if (used + cost > this.dailyUnits) {
      throw new QuotaExceededError(
        `YouTube daily quota budget reached (${used}/${this.dailyUnits} units, ${op} needs ${cost}). Will resume tomorrow.`,
      );
    }
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
    if (cost > 0) await this.usage.increment(this.key(), cost);
  }

  async usedToday(): Promise<number> {
    return this.usage.get(this.key());
  }
}
