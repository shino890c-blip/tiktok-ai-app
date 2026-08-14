import { SubtitleIcon } from "@/components/icons";

interface SubtitlePanelProps {
  subtitleText: string | null;
}

export function SubtitlePanel({ subtitleText }: SubtitlePanelProps) {
  return (
    <div>
      <span className="flex items-center gap-1.5 text-sm font-medium text-[#2D2B55] mb-1">
        <SubtitleIcon className="w-4 h-4 text-[#6B6885]" />
        字幕テキスト
      </span>
      <div className="rounded-lg border border-[#E8E6F0] bg-[#F8F7FA] px-3 py-2.5 text-sm text-[#2D2B55] leading-relaxed min-h-[72px] whitespace-pre-wrap">
        {subtitleText || <span className="text-[#6B6885]">字幕テキストはまだ登録されていません。</span>}
      </div>
    </div>
  );
}
