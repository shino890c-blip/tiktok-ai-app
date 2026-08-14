"use client";

import { SubtitleIcon, DownloadIcon } from "@/components/icons";

interface SubtitlePreviewProps {
  subtitleUrl: string;
  srtContent: string;
}

/** 字幕プレビュー：SRT形式のタイムコード付きプレビューとダウンロード */
export function SubtitlePreview({ subtitleUrl, srtContent }: SubtitlePreviewProps) {
  return (
    <div className="rounded-lg border border-[#E8E6F0] p-4">
      <div className="flex items-center gap-2 mb-3">
        <SubtitleIcon className="w-4 h-4 text-[#7C3AED]" />
        <span className="text-sm font-semibold text-[#2D2B55]">字幕（SRT）</span>
      </div>
      <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md bg-[#F8F7FA] p-3 text-xs leading-relaxed text-[#2D2B55] font-mono">
        {srtContent}
      </pre>
      <a
        href={subtitleUrl}
        download
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#7C3AED] hover:text-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded px-2 py-1 transition-colors"
      >
        <DownloadIcon className="w-4 h-4" />
        字幕ファイルをダウンロード
      </a>
    </div>
  );
}
