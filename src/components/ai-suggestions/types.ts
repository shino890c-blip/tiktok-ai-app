export type AiSuggestionType = "next_idea" | "pattern_analysis" | "improvement";
export type BasisConfidence = "low" | "high";

export interface AiSuggestionContent {
  title?: string;
  description: string;
  score?: number;
  patterns?: string[];
  advice?: string[];
}

export interface AiSuggestion {
  id: string;
  type: AiSuggestionType;
  content: AiSuggestionContent;
  basisConfidence: BasisConfidence;
  createdAt: string;
}

export const SUGGESTION_TYPE_LABELS: Record<AiSuggestionType, string> = {
  next_idea: "次回企画提案",
  pattern_analysis: "成功パターン分析",
  improvement: "改善提案",
};

export const CONFIDENCE_LABELS: Record<BasisConfidence, string> = {
  low: "仮説",
  high: "データ分析",
};

export const CONFIDENCE_COLORS: Record<BasisConfidence, { bg: string; text: string }> = {
  low: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]" },
  high: { bg: "bg-[#DCFCE7]", text: "text-[#22C55E]" },
};
