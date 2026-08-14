"use client";

interface MonthlySummaryPanelProps {
  totalAmount: number;
  totalExpense: number;
  totalProfit: number;
}

function formatCurrency(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

/** 選択中の月の売上・経費・利益サマリーを表示する。 */
export function MonthlySummaryPanel({ totalAmount, totalExpense, totalProfit }: MonthlySummaryPanelProps) {
  const cards = [
    { label: "売上合計", value: totalAmount, color: "text-[#2D2B55]" },
    { label: "経費合計", value: totalExpense, color: "text-[#EF4444]" },
    { label: "利益合計", value: totalProfit, color: totalProfit >= 0 ? "text-[#22C55E]" : "text-[#EF4444]" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-[#E8E6F0] bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-[#6B6885]">{card.label}</p>
          <p className={`mt-2 text-2xl font-bold ${card.color}`}>{formatCurrency(card.value)}</p>
        </div>
      ))}
    </div>
  );
}
