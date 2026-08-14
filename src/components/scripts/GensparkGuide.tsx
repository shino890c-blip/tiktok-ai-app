"use client";

import { useState } from "react";
import { ChevronDownIcon, ExternalLinkIcon } from "@/components/icons";

const GUIDE_STEPS = [
  "上の映像プロンプトをコピーする",
  "Genspark（AI動画生成ツール）を開く",
  "プロンプトを貼り付けて動画を生成する",
  "生成された動画をダウンロードする",
  "（任意）HitPaw Edimakorで音声・字幕を合成する",
  "完成動画のURLを下のフォームに登録する",
];

const GENSPARK_URL = "https://genspark.ai/tools/ai-video-generator";

/** Genspark/HitPawでの動画制作手順を示す折りたたみ可能なガイド */
export function GensparkGuide() {
  const [open, setOpen] = useState(true);

  return (
    <section aria-labelledby="genspark-guide-title" className="bg-white rounded-xl border border-[#E8E6F0] shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="genspark-guide-content"
        className="w-full flex items-center justify-between gap-3 px-5 sm:px-6 py-4 text-left hover:bg-[#F8F7FA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
      >
        <h2 id="genspark-guide-title" className="text-base font-bold text-[#2D2B55]">
          Genspark / HitPaw 操作ガイド
        </h2>
        <ChevronDownIcon
          className={`w-5 h-5 text-[#6B6885] shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div id="genspark-guide-content" className="px-5 sm:px-6 pb-6">
          <ol className="space-y-3">
            {GUIDE_STEPS.map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F3F0FF] text-[#7C3AED] text-xs font-bold shrink-0 mt-0.5">
                  {index + 1}
                </span>
                <span className="text-sm text-[#2D2B55] leading-relaxed pt-0.5">{step}</span>
              </li>
            ))}
          </ol>

          <a
            href={GENSPARK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#7C3AED] hover:text-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded px-2 py-1 transition-colors"
          >
            Gensparkを開く
            <ExternalLinkIcon className="w-4 h-4" />
          </a>
        </div>
      )}
    </section>
  );
}
