export type Platform = "tiktok" | "youtube" | "instagram" | "twitter" | "note";

export interface Account {
  id: string;
  platform: Platform;
  name: string;
  memo: string;
  createdAt: string;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  twitter: "X (Twitter)",
  note: "note",
};

export const PLATFORM_COLORS: Record<Platform, { bg: string; text: string }> = {
  tiktok: { bg: "bg-[#F3F0FF]", text: "text-[#7C3AED]" },
  youtube: { bg: "bg-[#FEE2E2]", text: "text-[#EF4444]" },
  instagram: { bg: "bg-[#FCE7F3]", text: "text-[#EC4899]" },
  twitter: { bg: "bg-[#E0F2FE]", text: "text-[#0EA5E9]" },
  note: { bg: "bg-[#DCFCE7]", text: "text-[#22C55E]" },
};

export interface AccountFormValues {
  platform: Platform;
  name: string;
  memo: string;
}
