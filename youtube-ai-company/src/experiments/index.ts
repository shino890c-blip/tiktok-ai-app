import type { Clock } from "../core/clock.js";
import { newId } from "../core/ids.js";
import type { Repositories } from "../database/repositories.js";
import type { ExperimentRecord } from "../database/types.js";

export const DEFAULT_EXPERIMENTS: Pick<ExperimentRecord, "name" | "hypothesis" | "variant" | "metric">[] = [
  {
    name: "Experiment A",
    hypothesis: "冒頭2秒で質問すると、視聴者の好奇心が刺激され視聴維持率が上がる",
    variant: "hook:question — 冒頭2秒で質問する",
    metric: "averageViewPercentage",
  },
  {
    name: "Experiment B",
    hypothesis: "冒頭で結論を提示すると、離脱が減り最後まで見られやすい",
    variant: "hook:conclusion — 冒頭で結論を提示する",
    metric: "averageViewPercentage",
  },
  {
    name: "Experiment C",
    hypothesis: "20秒以内にまとめるとループ再生が増え、再生数が伸びる",
    variant: "duration:20 — 20秒以内にまとめる",
    metric: "views",
  },
  {
    name: "Experiment D",
    hypothesis: "35秒前後にすると情報量が増え、保存・共有が増える",
    variant: "duration:35 — 35秒前後にする",
    metric: "shares",
  },
];

/** Manages A/B-style experiments. The Analyst judges each result; this class stores and aggregates. */
export class ExperimentManager {
  constructor(
    private readonly repos: Repositories,
    private readonly clock: Clock,
    /** Videos needed before an experiment is concluded (one sample is anecdote, not evidence). */
    private readonly minSamples = 3,
  ) {}

  async seedDefaults(): Promise<void> {
    if ((await this.repos.experiments.count()) > 0) return;
    for (const e of DEFAULT_EXPERIMENTS) {
      await this.repos.experiments.insert({
        experiment_id: newId("exp"),
        ...e,
        status: "planned",
        result: null,
        conclusion: null,
        video_ids: [],
        min_samples: this.minSamples,
      });
    }
  }

  /** Picks the open experiment with the fewest samples (round-robin across variants). */
  async pickNext(): Promise<ExperimentRecord | undefined> {
    const open = await this.repos.experiments.list({ where: { status: ["planned", "running"] }, orderBy: "created_at ASC" });
    if (!open.length) return undefined;
    return open.reduce((best, e) => (e.video_ids.length < best.video_ids.length ? e : best));
  }

  async attachVideo(experimentId: string, videoId: string): Promise<void> {
    const e = await this.repos.experiments.get(experimentId);
    if (!e || e.video_ids.includes(videoId)) return;
    await this.repos.experiments.update(experimentId, { video_ids: [...e.video_ids, videoId], status: "running" });
  }

  /**
   * Records the Analyst's verdict. The experiment completes once it has min_samples
   * judged videos; the conclusion is the majority verdict.
   */
  async recordResult(
    experimentId: string,
    videoId: string,
    verdict: "success" | "failure" | "inconclusive",
    metricValue: number | null,
    baseline: number | null,
  ): Promise<ExperimentRecord | undefined> {
    const e = await this.repos.experiments.get(experimentId);
    if (!e) return undefined;
    const prev = (e.result?.samples as { videoId: string; verdict: string; metricValue: number | null; baseline: number | null }[]) ?? [];
    const samples = [...prev.filter((s) => s.videoId !== videoId), { videoId, verdict, metricValue, baseline, at: this.clock.now().toISOString() }];
    const done = samples.length >= e.min_samples;
    const tally = (v: string) => samples.filter((s) => s.verdict === v).length;
    const conclusion: ExperimentRecord["conclusion"] = done
      ? tally("success") > tally("failure")
        ? "success"
        : tally("failure") > tally("success")
          ? "failure"
          : "inconclusive"
      : null;
    await this.repos.experiments.update(experimentId, {
      result: { samples, metric: e.metric },
      status: done ? "completed" : "running",
      conclusion,
      video_ids: e.video_ids.includes(videoId) ? e.video_ids : [...e.video_ids, videoId],
    });
    return this.repos.experiments.get(experimentId);
  }

  async list(): Promise<ExperimentRecord[]> {
    return this.repos.experiments.list({ orderBy: "created_at ASC" });
  }
}
