"use client";

import { accountNames, genreNames } from "./sampleData";
import type { PeriodOption } from "./types";

const periodOptions: { id: PeriodOption; label: string }[] = [
  { id: "7d", label: "過去7日" },
  { id: "30d", label: "過去30日" },
  { id: "90d", label: "過去90日" },
  { id: "custom", label: "カスタム" },
];

interface FiltersProps {
  period: PeriodOption;
  onPeriodChange: (period: PeriodOption) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  account: string;
  onAccountChange: (value: string) => void;
  genre: string;
  onGenreChange: (value: string) => void;
}

export function Filters({
  period,
  onPeriodChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  account,
  onAccountChange,
  genre,
  onGenreChange,
}: FiltersProps) {
  return (
    <div className="bg-white rounded-xl border border-[#E8E6F0] p-4 shadow-sm flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[#6B6885] mr-1">期間</span>
        {periodOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onPeriodChange(option.id)}
            className={`px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] ${
              period === option.id
                ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                : "bg-white text-[#2D2B55] border-[#E8E6F0] hover:border-[#7C3AED] hover:text-[#7C3AED]"
            }`}
          >
            {option.label}
          </button>
        ))}
        {period === "custom" && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date"
              value={customStart}
              onChange={(event) => onCustomStartChange(event.target.value)}
              className="rounded-lg border border-[#E8E6F0] px-2 py-1.5 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
            />
            <span className="text-[#6B6885] text-sm">〜</span>
            <input
              type="date"
              value={customEnd}
              onChange={(event) => onCustomEndChange(event.target.value)}
              className="rounded-lg border border-[#E8E6F0] px-2 py-1.5 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="account-filter" className="text-xs font-semibold text-[#6B6885]">
            アカウント
          </label>
          <select
            id="account-filter"
            value={account}
            onChange={(event) => onAccountChange(event.target.value)}
            className="rounded-lg border border-[#E8E6F0] px-3 py-1.5 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
          >
            <option value="all">すべて</option>
            {accountNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="genre-filter" className="text-xs font-semibold text-[#6B6885]">
            ジャンル
          </label>
          <select
            id="genre-filter"
            value={genre}
            onChange={(event) => onGenreChange(event.target.value)}
            className="rounded-lg border border-[#E8E6F0] px-3 py-1.5 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
          >
            <option value="all">すべて</option>
            {genreNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
