import { z } from "zod";

/**
 * Structured contracts between agents and the LLM. Every LLM response is validated
 * against these schemas before it is stored or handed to the next agent.
 */

export const ResearchIdeaSchema = z.object({
  topic: z.string().min(2),
  hook: z.string().min(2),
  trend_reason: z.string().min(2),
  why_worth_making: z.string().min(2),
  target_audience: z.string().min(2),
  recommended_duration: z.number().int().min(5).max(180),
  structure: z.array(z.string()).min(3),
  confidence_score: z.number().min(0).max(1),
  source_urls: z.array(z.string()).default([]),
  originality_note: z.string().min(2),
});
export type ResearchIdea = z.infer<typeof ResearchIdeaSchema>;

export const ResearchOutputSchema = z.object({
  market_summary: z.string().min(2),
  audience_pains: z.array(z.string()).default([]),
  trend_patterns: z
    .array(z.object({ pattern: z.string(), evidence: z.string(), why_it_works: z.string() }))
    .default([]),
  ideas: z.array(ResearchIdeaSchema).min(1).max(8),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

export const SceneSchema = z.object({
  scene_no: z.number().int().min(1),
  start_sec: z.number().min(0),
  end_sec: z.number().min(0),
  narration: z.string(),
  telop: z.string(),
  visual: z.string(),
  sfx: z.string().default(""),
  bgm: z.string().default(""),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ScriptOutputSchema = z.object({
  title_candidates: z.array(z.string().min(1)).length(3),
  hook: z.object({
    time_range: z.string(),
    narration: z.string().min(1),
    telop: z.string().min(1),
    visual: z.string().min(1),
    intent: z.string().default(""),
  }),
  scenes: z.array(SceneSchema).min(2),
  cta: z.string().min(1),
  estimated_duration_sec: z.number().min(1),
  retention_points: z.array(z.object({ time_sec: z.number(), technique: z.string() })).min(1),
  description: z.string().min(1),
  hashtags: z.array(z.string()).min(1),
  bgm_direction: z.string().default(""),
  fact_check_notes: z.array(z.string()).default([]),
});
export type ScriptOutput = z.infer<typeof ScriptOutputSchema>;

export const QCIssueSchema = z.object({
  severity: z.enum(["blocker", "major", "minor"]),
  field: z.string(),
  message: z.string(),
  suggestion: z.string().default(""),
});
export type QCIssue = z.infer<typeof QCIssueSchema>;

export const QCReviewSchema = z.object({
  issues: z.array(QCIssueSchema).default([]),
  overall_score: z.number().min(0).max(100),
  summary: z.string().default(""),
});
export type QCReview = z.infer<typeof QCReviewSchema>;

export const AnalysisOutputSchema = z.object({
  success: z.boolean(),
  verdict_reason: z.string(),
  what_worked: z.array(z.string()).default([]),
  what_failed: z.array(z.string()).default([]),
  hook_assessment: z.string(),
  duration_assessment: z.string(),
  retention_analysis: z.array(z.string()).default([]),
  title_assessment: z.string(),
  theme_strength: z.enum(["strong", "medium", "weak", "unknown"]),
  comparison_to_past: z.string(),
  recommended_changes: z.array(z.string()).min(1),
  next_experiments: z.array(z.string()).default([]),
  growth_hypothesis: z.string(),
  experiment_verdict: z.enum(["success", "failure", "inconclusive"]).nullable().default(null),
});
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;
