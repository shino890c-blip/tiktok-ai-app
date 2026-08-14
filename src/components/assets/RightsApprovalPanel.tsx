"use client";

import { CheckCircleIcon } from "@/components/icons";

interface RightsApprovalPanelProps {
  rightsChecked: boolean;
  isApproved: boolean;
  approvedAt: string | null;
  onToggleRights: () => void;
  onApprove: () => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RightsApprovalPanel({
  rightsChecked,
  isApproved,
  approvedAt,
  onToggleRights,
  onApprove,
}: RightsApprovalPanelProps) {
  return (
    <section className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm space-y-4">
      <h3 className="text-base font-bold text-[#2D2B55]">権利確認・承認</h3>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={rightsChecked}
          onChange={onToggleRights}
          disabled={isApproved}
          className="mt-0.5 w-4 h-4 rounded border-[#E8E6F0] text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] disabled:opacity-60"
        />
        <span className="text-sm text-[#2D2B55]">
          この素材の使用権利・ライセンスを確認済みです
        </span>
      </label>

      <div className="flex items-center justify-between rounded-lg bg-[#F8F7FA] px-4 py-3">
        <div className="flex items-center gap-2">
          {isApproved ? (
            <CheckCircleIcon className="w-5 h-5 text-[#22C55E]" />
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-[#E8E6F0]" />
          )}
          <div>
            <div className="text-sm font-semibold text-[#2D2B55]">
              {isApproved ? "承認済み" : "未承認"}
            </div>
            {isApproved && approvedAt && (
              <div className="text-xs text-[#6B6885]">{formatDate(approvedAt)}</div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onApprove}
          disabled={!rightsChecked || isApproved}
          className={`px-5 py-2.5 rounded-lg text-sm font-bold shadow-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] ${
            !rightsChecked || isApproved
              ? "bg-[#E8E6F0] text-[#6B6885] cursor-not-allowed shadow-none"
              : "bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
          }`}
        >
          {isApproved ? "承認済み" : "承認する"}
        </button>
      </div>

      {!rightsChecked && !isApproved && (
        <p className="text-xs text-[#6B6885]">
          権利確認チェックを済ませると承認ボタンが有効になります。
        </p>
      )}
    </section>
  );
}
