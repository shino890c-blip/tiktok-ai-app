export type IdeaStatus = "draft" | "approved" | "rejected";

export interface Idea {
  id: string;
  title: string;
  description: string;
  genre: string;
  aiScore: number | null;
  status: IdeaStatus;
  isDuplicate: boolean;
  createdAt: string;
}

export const GENRES = [
  "音楽・プレイリスト",
  "美容・スキンケア",
  "ライフスタイル・家電",
  "料理・時短レシピ",
  "ファッション",
  "旅行・Vlog",
  "ペット・猫",
  "学習・自己啓発",
] as const;

export type Genre = (typeof GENRES)[number];

export const STATUS_LABELS: Record<IdeaStatus, string> = {
  draft: "未審査",
  approved: "承認済み",
  rejected: "却下",
};

export const STATUS_COLORS: Record<IdeaStatus, { bg: string; text: string }> = {
  draft: { bg: "bg-[#F3F0FF]", text: "text-[#7C3AED]" },
  approved: { bg: "bg-[#DCFCE7]", text: "text-[#22C55E]" },
  rejected: { bg: "bg-[#FEE2E2]", text: "text-[#EF4444]" },
};

export interface IdeaFormValues {
  title: string;
  description: string;
  genre: string;
}

export type SortKey = "score-desc" | "date-desc" | "date-asc";
