/** Domain records stored in the database. JSON columns are (de)serialized by the repositories. */

export type TaskStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "RETRYING"
  | "CANCELLED";

export const ACTIVE_TASK_STATUSES: TaskStatus[] = ["PENDING", "RUNNING", "RETRYING", "WAITING_APPROVAL"];

export type TaskType = "research" | "script" | "quality_check" | "render" | "publish" | "analytics" | "feedback";

export type AgentName = "researcher" | "scriptwriter" | "publisher" | "analyst" | "supervisor";

export type AgentStatus = "idle" | "running" | "error" | "stalled" | "stopped";

export type PipelineStage =
  | "RESEARCH"
  | "SCRIPT"
  | "QUALITY_CHECK"
  | "RENDER"
  | "WAITING_APPROVAL"
  | "PUBLISH"
  | "ANALYTICS"
  | "FEEDBACK"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type PipelineStatus = "ACTIVE" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface Timestamps {
  created_at: string;
  updated_at: string;
}

export interface AgentRecord extends Timestamps {
  name: AgentName;
  role: string;
  status: AgentStatus;
  last_heartbeat: string | null;
  current_task: string | null;
  task_id: string | null;
  restart_count: number;
  last_error: string | null;
}

export interface TaskRecord extends Timestamps {
  task_id: string;
  type: TaskType;
  agent: AgentName;
  status: TaskStatus;
  pipeline_id: string | null;
  priority: number;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  error_code: string | null;
  retry_count: number;
  max_retries: number;
  attempt: number;
  started_at: string | null;
  completed_at: string | null;
  heartbeat_at: string | null;
  next_run_at: string | null;
}

export interface PipelineRecord extends Timestamps {
  pipeline_id: string;
  goal: string;
  /** ai = Researcher/Script Writer wrote it; chatgpt = a human pasted a ChatGPT answer. */
  source: "ai" | "chatgpt";
  status: PipelineStatus;
  stage: PipelineStage;
  research_id: string | null;
  idea_id: string | null;
  script_id: string | null;
  video_id: string | null;
  analytics_id: string | null;
  experiment_id: string | null;
  revision_count: number;
  error: string | null;
}

export interface ResearchRecord extends Timestamps {
  research_id: string;
  pipeline_id: string | null;
  task_id: string | null;
  query: string;
  market_summary: string;
  findings: Record<string, unknown>;
  source_urls: string[];
  is_mock: number;
  file_path: string;
}

export interface IdeaRecord extends Timestamps {
  idea_id: string;
  research_id: string;
  pipeline_id: string | null;
  topic: string;
  hook: string;
  trend_reason: string;
  why_worth_making: string;
  target_audience: string;
  recommended_duration: number;
  structure: string[];
  confidence_score: number;
  source_urls: string[];
  experiment_id: string | null;
  status: "candidate" | "selected" | "rejected" | "used";
}

export interface ScriptRecord extends Timestamps {
  script_id: string;
  idea_id: string;
  pipeline_id: string | null;
  task_id: string | null;
  version: number;
  content: Record<string, unknown>;
  status: "draft" | "qc_passed" | "qc_failed";
  qc_report: Record<string, unknown> | null;
  file_path: string;
}

export type VideoStatus =
  | "rendering"
  | "rendered"
  | "delivered"
  | "ready_for_approval"
  | "approved"
  | "rejected"
  | "publishing"
  | "published"
  | "publish_failed"
  | "publish_unknown";

export interface VideoRecord extends Timestamps {
  video_id: string;
  pipeline_id: string | null;
  script_id: string;
  idea_id: string | null;
  experiment_id: string | null;
  title: string;
  description: string;
  tags: string[];
  privacy_status: "private" | "unlisted" | "public";
  video_file_path: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  /** Folder the finished video was delivered to (PUBLISH_TARGET=delivery). */
  delivery_path: string | null;
  status: VideoStatus;
  is_mock: number;
  published_at: string | null;
}

export interface AnalyticsRecord extends Timestamps {
  analytics_id: string;
  video_id: string;
  youtube_video_id: string;
  metrics: Record<string, unknown>;
  unavailable_metrics: string[];
  performance_score: number;
  report: Record<string, unknown>;
  is_mock: number;
  file_path: string;
}

export interface FeedbackRecord extends Timestamps {
  feedback_id: string;
  video_id: string | null;
  analytics_id: string | null;
  source_agent: AgentName;
  target_agent: AgentName;
  content: Record<string, unknown>;
  applied: number;
  file_path: string | null;
}

export interface SystemEventRecord extends Timestamps {
  event_id: string;
  level: string;
  agent: string | null;
  task_id: string | null;
  event: string;
  message: string;
  metadata: Record<string, unknown>;
}

export interface ApprovalRecord extends Timestamps {
  approval_id: string;
  video_id: string;
  pipeline_id: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  note: string | null;
}

export type KnowledgeCategory =
  | "video_outcome"
  | "hook"
  | "theme"
  | "duration"
  | "title_pattern"
  | "cta"
  | "retention"
  | "success_factor"
  | "failure_factor"
  | "experiment_result";

export interface KnowledgeRecord extends Timestamps {
  knowledge_id: string;
  category: KnowledgeCategory;
  polarity: "positive" | "negative" | "neutral";
  content: string;
  evidence: Record<string, unknown>;
  video_id: string | null;
  experiment_id: string | null;
  score: number | null;
}

export interface ExperimentRecord extends Timestamps {
  experiment_id: string;
  name: string;
  hypothesis: string;
  variant: string;
  metric: string;
  status: "planned" | "running" | "completed";
  result: Record<string, unknown> | null;
  conclusion: "success" | "failure" | "inconclusive" | null;
  video_ids: string[];
  min_samples: number;
}
