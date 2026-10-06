import type { ScheduleConfig } from "../../config";
import { todayAt } from "../../utils";

export type Stage = "research" | "strategy" | "writing" | "quality" | "draft";

/**
 * When a stage should run. In "daily" mode a stage waits for its configured
 * time of day (or runs now if that time has already passed); in "immediate"
 * mode everything runs as soon as possible.
 */
export function scheduleFor(stage: Stage, cfg: ScheduleConfig, now: Date = new Date()): Date | null {
  if (cfg.mode === "immediate") return null;
  const at = todayAt(cfg[stage], now);
  return at > now ? at : null;
}

export function analyticsTime(cfg: ScheduleConfig, publishedAt: Date = new Date()): Date | null {
  if (cfg.mode === "immediate" || cfg.analyticsDelayHours <= 0) return null;
  return new Date(publishedAt.getTime() + cfg.analyticsDelayHours * 3600_000);
}
