import type { IdeaStatus, SortKey } from "@/components/ideas/types";
import { GENRES, STATUS_LABELS } from "@/components/ideas/types";

interface IdeaFilterBarProps {
  genreFilter: string;
  statusFilter: IdeaStatus | "all";
  sortKey: SortKey;
  onGenreFilterChange: (genre: string) => void;
  onStatusFilterChange: (status: IdeaStatus | "all") => void;
  onSortKeyChange: (key: SortKey) => void;
}

const STATUS_OPTIONS: (IdeaStatus | "all")[] = ["all", "draft", "approved", "rejected"];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "score-desc", label: "スコアが高い順" },
  { value: "date-desc", label: "新しい順" },
  { value: "date-asc", label: "古い順" },
];

/** ジャンル・ステータスでの絞り込みと並び替えを行うツールバー。 */
export function IdeaFilterBar({
  genreFilter,
  statusFilter,
  sortKey,
  onGenreFilterChange,
  onStatusFilterChange,
  onSortKeyChange,
}: IdeaFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#E8E6F0] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <label htmlFor="genre-filter" className="text-xs font-semibold text-[#6B6885]">
            ジャンル
          </label>
          <select
            id="genre-filter"
            value={genreFilter}
            onChange={(event) => onGenreFilterChange(event.target.value)}
            className="rounded-lg border border-[#E8E6F0] bg-white px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED]"
          >
            <option value="all">すべて</option>
            {GENRES.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="status-filter" className="text-xs font-semibold text-[#6B6885]">
            ステータス
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as IdeaStatus | "all")}
            className="rounded-lg border border-[#E8E6F0] bg-white px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED]"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "すべて" : STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sort-key" className="text-xs font-semibold text-[#6B6885]">
          並び替え
        </label>
        <select
          id="sort-key"
          value={sortKey}
          onChange={(event) => onSortKeyChange(event.target.value as SortKey)}
          className="rounded-lg border border-[#E8E6F0] bg-white px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED]"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
