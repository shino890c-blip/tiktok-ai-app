"use client";

import { SparkleIcon, ClockIcon } from "@/components/icons";
import { GenerationProgress } from "./GenerationProgress";
import { ScenePromptList } from "./ScenePromptList";
import { AudioPlayer } from "./AudioPlayer";
import { SubtitlePreview } from "./SubtitlePreview";
import type { GenerateAllResponse, GenerationStep } from "./types";

interface AssetGeneratorProps {
  isGenerating: boolean;
  steps: GenerationStep[];
  result: GenerateAllResponse | null;
  srtContent: string | null;
  errorMessage: string | null;
  onGenerate: () => void;
  onCopyPrompt: (text: string) => void;
}

/** 素材自動生成セクション：生成ボタン、進捗表示、生成結果（プロンプト/音声/字幕）の表示 */
export function AssetGenerator({
  isGenerating,
  steps,
  result,
  srtContent,
  errorMessage,
  onGenerate,
  onCopyPrompt,
}: AssetGeneratorProps) {
  const hasResult = result !== null;

  return (
    <section aria-labelledby="asset-generator-title" className="bg-white rounded-xl border border-[#E8E6F0] p-5 sm:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <SparkleIcon className="w-5 h-5 text-[#7C3AED]" />
        <h2 id="asset-generator-title" className="text-lg font-bold text-[#2D2B55]">
          素材自動生成
        </h2>
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating}
        className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-60 text-white text-base font-bold rounded-xl shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
      >
        {isGenerating ? (
          <ClockIcon className="w-5 h-5 animate-spin" />
        ) : (
          <SparkleIcon className="w-5 h-5" />
        )}
        {isGenerating ? "生成中..." : "素材を自動生成"}
      </button>

      {(isGenerating || hasResult) && (
        <div className="mt-6 rounded-lg bg-[#F8F7FA] p-4">
          <GenerationProgress steps={steps} />
        </div>
      )}

      {errorMessage && (
        <p className="mt-4 text-sm font-medium text-[#EF4444]">{errorMessage}</p>
      )}

      {hasResult && (
        <div className="mt-6 space-y-6">
          {result.assets.scenes.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-[#2D2B55] mb-3">映像プロンプト一覧</h3>
              <ScenePromptList scenes={result.assets.scenes} onCopy={onCopyPrompt} />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.assets.audioUrl && <AudioPlayer audioUrl={result.assets.audioUrl} />}
            {result.assets.subtitleUrl && srtContent && (
              <SubtitlePreview subtitleUrl={result.assets.subtitleUrl} srtContent={srtContent} />
            )}
          </div>

          {result.isMock && (
            <p className="text-xs text-[#6B6885] bg-[#FFF7ED] rounded-md px-3 py-2">
              現在はモックデータで生成されています。実データを生成するには、APIキーの設定が必要です。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
