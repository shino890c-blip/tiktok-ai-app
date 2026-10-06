import type { ArticleMode } from "./config";

export type AgentName = "researcher" | "strategist" | "writer" | "quality" | "publisher" | "analytics" | "supervisor";

export const TASK_STATUSES = [
  "PENDING",
  "RUNNING",
  "WAITING_APPROVAL",
  "COMPLETED",
  "FAILED",
  "RETRYING",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskType =
  | "research"
  | "strategy"
  | "writing"
  | "quality"
  | "draft"
  | "approval"
  | "publish"
  | "analytics"
  | "knowledge";

export interface Task {
  task_id: string;
  agent: AgentName;
  type: TaskType;
  status: TaskStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  scheduled_at: string | null;
  retry_count: number;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  pipeline_id: string | null;
}

export interface Heartbeat {
  agent: AgentName;
  status: "idle" | "running" | "error" | "restarting";
  task_id: string | null;
  last_heartbeat: string;
  restarts: number;
}

export interface Idea {
  idea_id: string;
  topic: string;
  target_reader: string;
  reader_problem: string;
  trend_reason: string;
  unique_angle: string;
  title_candidates: string[];
  monetization_potential: number;
  confidence: number;
  sources: string[];
}

export interface OutlineSection {
  heading: string;
  points: string[];
  paid: boolean;
}

export interface Strategy {
  strategy_id: string;
  idea_id: string;
  content_type: "free" | "paid";
  article_mode: ArticleMode;
  title: string;
  subtitle: string;
  purpose: string;
  outline: OutlineSection[];
  free_value: string;
  paid_value: string;
  price: number;
  cta: string;
  target_reader: string;
  reader_takeaway: string;
}

export interface Seo {
  title: string;
  description: string;
  tags: string[];
  slug: string;
}

export interface Article {
  article_id: string;
  strategy_id: string;
  idea_id: string;
  title: string;
  body_markdown: string;
  free_part: string;
  paid_part: string;
  mode: ArticleMode;
  price: number;
  tags: string[];
  seo: Seo;
  cover_image: string | null;
  body_images: string[];
  quality_score: number | null;
  status: "WRITING" | "QC_FAILED" | "QC_PASSED" | "DRAFT" | "APPROVED" | "REJECTED" | "PUBLISHED" | "FAILED";
  revision: number;
  file_path: string | null;
}

export interface QualityIssue {
  check: string;
  severity: "info" | "minor" | "major" | "critical";
  message: string;
  penalty: number;
}

export interface QualityReport {
  article_id: string;
  score: number;
  passed: boolean;
  issues: QualityIssue[];
  breakdown: Record<string, number>;
  safe_to_publish: boolean;
}

export interface Draft {
  draft_id: string;
  article_id: string;
  status: "DRAFT" | "FAILED";
  note_url: string | null;
  edit_url: string | null;
  is_mock: boolean;
  created_at: string;
}

export interface PublishedArticle {
  published_id: string;
  article_id: string;
  status: "PUBLISHED";
  note_url: string;
  published_at: string;
  is_mock: boolean;
}

/** Metrics actually observed. null = not obtainable (never guessed). */
export interface ArticleMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  sales: number | null;
  revenue: number | null;
  follower_growth: number | null;
  source: "note" | "simulation";
}

export interface AnalyticsResult {
  article_id: string;
  performance_score: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  sales: number | null;
  engagement: number | null;
  conversion: number | null;
  what_worked: string[];
  what_failed: string[];
  next_actions: string[];
  is_simulated: boolean;
}

export type ApprovalAction = "APPROVE" | "REJECT" | "EDIT" | "REGENERATE";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EDITED" | "REGENERATE";

export interface Approval {
  approval_id: string;
  article_id: string;
  draft_id: string | null;
  status: ApprovalStatus;
  comment: string | null;
  created_at: string;
  decided_at: string | null;
}
