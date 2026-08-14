"use client";

import { useId, useState } from "react";
import { InfoIcon } from "@/components/icons";

interface TooltipProps {
  label: string;
}

/** 専門用語の説明を表示するツールチップ。ラベル横のinfoアイコンにフォーカス/ホバーすると表示される。 */
export function Tooltip({ label }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-describedby={tooltipId}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="text-[#6B6885] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded-full transition-colors"
      >
        <InfoIcon className="w-3.5 h-3.5" />
      </button>
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute left-1/2 bottom-full z-20 mb-2 w-56 -translate-x-1/2 rounded-lg bg-[#2D2B55] px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
        >
          {label}
        </span>
      )}
    </span>
  );
}
