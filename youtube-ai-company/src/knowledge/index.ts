import type { ArtifactStore } from "../core/artifacts.js";
import { newId } from "../core/ids.js";
import type { Repositories } from "../database/repositories.js";
import type { KnowledgeCategory, KnowledgeRecord } from "../database/types.js";

export interface KnowledgeInput {
  category: KnowledgeCategory;
  polarity: KnowledgeRecord["polarity"];
  content: string;
  evidence?: Record<string, unknown>;
  videoId?: string | null;
  experimentId?: string | null;
  score?: number | null;
}

export interface KnowledgeDigest {
  positive: string[];
  negative: string[];
  goodHooks: string[];
  badHooks: string[];
  goodThemes: string[];
  badThemes: string[];
  experimentResults: string[];
  totalEntries: number;
}

/**
 * Team memory. It only records experience and serves it back as prompt context /
 * decision input — it never modifies models, prompts files or configuration.
 */
export class KnowledgeBase {
  constructor(
    private readonly repos: Repositories,
    private readonly artifacts: ArtifactStore,
  ) {}

  async record(input: KnowledgeInput): Promise<KnowledgeRecord> {
    return this.repos.knowledge.insert({
      knowledge_id: newId("kb"),
      category: input.category,
      polarity: input.polarity,
      content: input.content,
      evidence: input.evidence ?? {},
      video_id: input.videoId ?? null,
      experiment_id: input.experimentId ?? null,
      score: input.score ?? null,
    });
  }

  async list(opts: { category?: KnowledgeCategory; polarity?: KnowledgeRecord["polarity"]; limit?: number } = {}): Promise<KnowledgeRecord[]> {
    return this.repos.knowledge.list({
      where: { category: opts.category, polarity: opts.polarity },
      limit: opts.limit ?? 50,
    });
  }

  async forVideo(videoId: string): Promise<KnowledgeRecord[]> {
    return this.repos.knowledge.list({ where: { video_id: videoId } });
  }

  /** Compact summary injected into agent prompts. */
  async digest(limitPerBucket = 5): Promise<KnowledgeDigest> {
    const take = async (category: KnowledgeCategory | undefined, polarity: KnowledgeRecord["polarity"]) =>
      (await this.list({ category, polarity, limit: limitPerBucket })).map((k) => k.content);
    return {
      positive: await take("success_factor", "positive"),
      negative: await take("failure_factor", "negative"),
      goodHooks: await take("hook", "positive"),
      badHooks: await take("hook", "negative"),
      goodThemes: await take("theme", "positive"),
      badThemes: await take("theme", "negative"),
      experimentResults: (await this.list({ category: "experiment_result", limit: limitPerBucket })).map((k) => k.content),
      totalEntries: await this.repos.knowledge.count(),
    };
  }

  /** Writes a JSON snapshot to data/knowledge/knowledge-base.json for humans / backups. */
  async exportSnapshot(): Promise<string> {
    const all = await this.repos.knowledge.list({ limit: 1000 });
    return this.artifacts.write("knowledge", "knowledge-base", { exported_entries: all.length, entries: all });
  }
}
