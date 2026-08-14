import type { ScenePrompt } from "@/lib/video-generator/types";

/** 台本フォームで編集する秒数構成の1行（UI上のみで使うID付き） */
export interface StructureRow {
  uid: string;
  time: string;
  content: string;
}

/** 台本フォーム全体の状態 */
export interface ScriptFormState {
  hook: string;
  narration: string;
  structure: StructureRow[];
  videoPrompt: string;
}

export type GenerationStepId = "prompts" | "voice" | "subtitles";

export type GenerationStepStatus = "pending" | "in_progress" | "success" | "error";

export interface GenerationStep {
  id: GenerationStepId;
  label: string;
  status: GenerationStepStatus;
  message?: string;
}

/** /api/video/generate-all のレスポンス形状（このUIで使う分のみ） */
export interface GenerateAllResponse {
  jobId: string;
  provider: string;
  steps: { step: GenerationStepId; status: "success" | "error"; message?: string }[];
  assets: {
    scenes: ScenePrompt[];
    audioUrl: string | null;
    subtitleUrl: string | null;
  };
  isMock: boolean;
}

export type RegistrationStatus = "idle" | "approved" | "rejected";
