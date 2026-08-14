"use client";

import { ScriptIcon, PlusIcon, TrashIcon, CheckIcon } from "@/components/icons";
import { Tooltip } from "@/components/ui/Tooltip";
import type { StructureRow } from "./types";

interface ScriptEditorProps {
  hook: string;
  narration: string;
  structure: StructureRow[];
  videoPrompt: string;
  saved: boolean;
  onHookChange: (value: string) => void;
  onNarrationChange: (value: string) => void;
  onVideoPromptChange: (value: string) => void;
  onStructureChange: (uid: string, field: "time" | "content", value: string) => void;
  onStructureAdd: () => void;
  onStructureRemove: (uid: string) => void;
  onSave: () => void;
}

/** 台本入力セクション：フック / ナレーション原稿 / 秒数構成 / 映像プロンプトの編集フォーム */
export function ScriptEditor({
  hook,
  narration,
  structure,
  videoPrompt,
  saved,
  onHookChange,
  onNarrationChange,
  onVideoPromptChange,
  onStructureChange,
  onStructureAdd,
  onStructureRemove,
  onSave,
}: ScriptEditorProps) {
  return (
    <section aria-labelledby="script-editor-title" className="bg-white rounded-xl border border-[#E8E6F0] p-5 sm:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <ScriptIcon className="w-5 h-5 text-[#7C3AED]" />
        <h2 id="script-editor-title" className="text-lg font-bold text-[#2D2B55]">
          台本入力
        </h2>
      </div>

      <div className="space-y-5">
        <div>
          <label htmlFor="script-hook" className="flex items-center gap-1.5 text-sm font-semibold text-[#2D2B55] mb-2">
            フック（冒頭1-3秒）
            <Tooltip label="視聴者の離脱を防ぐための、動画開始直後の惹きつけフレーズです。" />
          </label>
          <input
            id="script-hook"
            type="text"
            value={hook}
            onChange={(event) => onHookChange(event.target.value)}
            placeholder="例: 知らないと損する〇〇の裏側..."
            className="w-full rounded-lg border border-[#E8E6F0] px-4 py-2.5 text-sm text-[#2D2B55] placeholder:text-[#A8A5BD] focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20 transition-colors"
          />
        </div>

        <div>
          <label htmlFor="script-narration" className="text-sm font-semibold text-[#2D2B55] mb-2 block">
            ナレーション原稿
          </label>
          <textarea
            id="script-narration"
            value={narration}
            onChange={(event) => onNarrationChange(event.target.value)}
            rows={5}
            placeholder="動画全体で読み上げるナレーションの原稿を入力してください。"
            className="w-full rounded-lg border border-[#E8E6F0] px-4 py-2.5 text-sm text-[#2D2B55] placeholder:text-[#A8A5BD] focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20 transition-colors resize-y"
          />
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm font-semibold text-[#2D2B55]">秒数構成</span>
            <Tooltip label="動画の時間帯ごとに、どの場面を映すかを指定します。生成される映像プロンプトのシーン分割に使われます。" />
          </div>

          <div className="space-y-2">
            {structure.map((row, index) => (
              <div key={row.uid} className="flex items-start gap-2">
                <input
                  type="text"
                  aria-label={`場面${index + 1}の時間範囲`}
                  value={row.time}
                  onChange={(event) => onStructureChange(row.uid, "time", event.target.value)}
                  placeholder="0-5秒"
                  className="w-24 sm:w-28 shrink-0 rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] placeholder:text-[#A8A5BD] focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20 transition-colors"
                />
                <input
                  type="text"
                  aria-label={`場面${index + 1}の内容`}
                  value={row.content}
                  onChange={(event) => onStructureChange(row.uid, "content", event.target.value)}
                  placeholder="場面の内容を入力"
                  className="flex-1 rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] placeholder:text-[#A8A5BD] focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20 transition-colors"
                />
                <button
                  type="button"
                  aria-label={`場面${index + 1}を削除`}
                  onClick={() => onStructureRemove(row.uid)}
                  disabled={structure.length <= 1}
                  className="shrink-0 p-2 rounded-lg text-[#6B6885] hover:text-[#EF4444] hover:bg-[#FEE2E2] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#6B6885] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onStructureAdd}
            className="mt-3 flex items-center gap-1 text-sm font-medium text-[#7C3AED] hover:text-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded px-2 py-1 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            場面を追加
          </button>
        </div>

        <div>
          <label htmlFor="script-video-prompt" className="flex items-center gap-1.5 text-sm font-semibold text-[#2D2B55] mb-2">
            映像プロンプト
            <Tooltip label="動画生成AI（Genspark等）に渡す映像イメージの指示文です。素材自動生成時にシーンごとのプロンプトの土台にもなります。" />
          </label>
          <textarea
            id="script-video-prompt"
            value={videoPrompt}
            onChange={(event) => onVideoPromptChange(event.target.value)}
            rows={3}
            placeholder="例: 縦型9:16、シネマティックな照明、トレンド感のあるTikTok風の映像..."
            className="w-full rounded-lg border border-[#E8E6F0] px-4 py-2.5 text-sm text-[#2D2B55] placeholder:text-[#A8A5BD] focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20 transition-colors resize-y"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onSave}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#2D2B55] hover:bg-[#3e3c6e] text-white text-sm font-semibold rounded-lg shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
          >
            台本を保存
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-[#22C55E]">
              <CheckIcon className="w-4 h-4" />
              保存しました
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
