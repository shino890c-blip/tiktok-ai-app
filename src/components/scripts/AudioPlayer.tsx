"use client";

import { MicIcon, DownloadIcon } from "@/components/icons";

interface AudioPlayerProps {
  audioUrl: string;
}

/** 音声プレーヤー：生成されたナレーション音声のインライン再生とダウンロード */
export function AudioPlayer({ audioUrl }: AudioPlayerProps) {
  return (
    <div className="rounded-lg border border-[#E8E6F0] p-4">
      <div className="flex items-center gap-2 mb-3">
        <MicIcon className="w-4 h-4 text-[#7C3AED]" />
        <span className="text-sm font-semibold text-[#2D2B55]">ナレーション音声</span>
      </div>
      <audio controls src={audioUrl} className="w-full">
        お使いのブラウザは音声再生に対応していません。
      </audio>
      <a
        href={audioUrl}
        download
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#7C3AED] hover:text-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded px-2 py-1 transition-colors"
      >
        <DownloadIcon className="w-4 h-4" />
        音声をダウンロード
      </a>
    </div>
  );
}
