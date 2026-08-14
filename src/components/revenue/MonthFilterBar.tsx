"use client";

interface MonthFilterBarProps {
  months: string[];
  selectedMonth: string;
  onMonthChange: (month: string) => void;
}

function formatMonthLabel(month: string): string {
  if (month === "all") return "すべての月";
  const [year, m] = month.split("-");
  return `${year}年${Number(m)}月`;
}

/** 月別に収益レコードを絞り込むフィルターバー。 */
export function MonthFilterBar({ months, selectedMonth, onMonthChange }: MonthFilterBarProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#E8E6F0] bg-white p-4 shadow-sm">
      <label htmlFor="month-filter" className="text-sm font-semibold text-[#2D2B55] shrink-0">
        月別フィルター
      </label>
      <select
        id="month-filter"
        value={selectedMonth}
        onChange={(event) => onMonthChange(event.target.value)}
        className="w-full max-w-xs rounded-lg border border-[#E8E6F0] bg-white px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED]"
      >
        <option value="all">すべての月</option>
        {months.map((month) => (
          <option key={month} value={month}>
            {formatMonthLabel(month)}
          </option>
        ))}
      </select>
    </div>
  );
}
