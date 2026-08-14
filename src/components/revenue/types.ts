export type RevenueSourceType = "ad_revenue" | "affiliate" | "sponsorship" | "other";

export interface Revenue {
  id: string;
  sourceType: RevenueSourceType;
  amount: number;
  expense: number;
  recordDate: string;
  memo: string;
}

export const SOURCE_TYPE_LABELS: Record<RevenueSourceType, string> = {
  ad_revenue: "広告収入",
  affiliate: "アフィリエイト",
  sponsorship: "スポンサー",
  other: "その他",
};

export const SOURCE_TYPE_COLORS: Record<RevenueSourceType, { bg: string; text: string }> = {
  ad_revenue: { bg: "bg-[#F3F0FF]", text: "text-[#7C3AED]" },
  affiliate: { bg: "bg-[#DCFCE7]", text: "text-[#22C55E]" },
  sponsorship: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]" },
  other: { bg: "bg-[#E0F2FE]", text: "text-[#0EA5E9]" },
};

export interface RevenueFormValues {
  sourceType: RevenueSourceType;
  amount: number;
  expense: number;
  recordDate: string;
  memo: string;
}

export interface MonthlySummary {
  month: string;
  totalAmount: number;
  totalExpense: number;
  totalProfit: number;
}
