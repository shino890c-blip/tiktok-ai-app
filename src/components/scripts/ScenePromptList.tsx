"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon } from "@/components/icons";
import type { ScenePrompt } from "@/lib/video-generator/types";

interface ScenePromptListProps {
  scenes: ScenePrompt[];
  onCopy: (text: string) => void;
}

/** 映像プロンプト一覧：シーンごとのプロンプトカードとコピー機能 */
export function ScenePromptList({ scenes, onCopy }: ScenePromptListProps) {
  return (
    <div className="space-y-3">
      {scenes.map((scene) => (
        <ScenePromptCard key={scene.sceneIndex} scene={scene} onCopy={onCopy} />
      ))}
    </div>
  );
}

function ScenePromptCard({ scene, onCopy }: { scene: ScenePrompt; onCopy: (text: string) => void }) {
  const [justCopied, setJustCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(scene.prompt);
      setJustCopied(true);
      onCopy(scene.prompt);
      setTimeout(() => setJustCopied(false), 2000);
    } catch {
      // クリップボードAPIが使えない環境では何もしない
    }
  };

  return (
    <article className="rounded-lg border border-[#E8E6F0] p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#F3F0FF] text-[#7C3AED] text-xs font-bold shrink-0">
            {scene.sceneIndex}
          </span>
          <span className="text-sm font-semibold text-[#2D2B55]">{scene.time}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] shrink-0 ${
            justCopied
              ? "bg-[#DCFCE7] text-[#22C55E]"
              : "bg-white text-[#2D2B55] border border-[#E8E6F0] hover:border-[#7C3AED] hover:text-[#7C3AED]"
          }`}
        >
          {justCopied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
          {justCopied ? "コピー済み" : "コピー"}
        </button>
      </div>
      <p className="text-xs text-[#6B6885] mb-2">{scene.content}</p>
      <p className="text-sm text-[#2D2B55] bg-[#F8F7FA] rounded-md p-3 leading-relaxed font-mono text-[13px]">
        {scene.prompt}
      </p>
    </article>
  );
}
