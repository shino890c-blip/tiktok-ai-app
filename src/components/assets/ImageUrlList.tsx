"use client";

import { useState } from "react";
import { ExternalLinkIcon, PlusIcon, TrashIcon } from "@/components/icons";

interface ImageUrlListProps {
  imageUrls: string[];
  onAdd: (url: string) => void;
  onRemove: (index: number) => void;
}

export function ImageUrlList({ imageUrls, onAdd, onRemove }: ImageUrlListProps) {
  const [newUrl, setNewUrl] = useState("");

  const handleAdd = () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewUrl("");
  };

  return (
    <div>
      <span className="block text-sm font-medium text-[#2D2B55] mb-1">画像URL一覧</span>

      <div className="space-y-2">
        {imageUrls.map((url, index) => (
          <div key={`${url}-${index}`} className="flex items-center gap-2">
            <div className="flex-1 truncate rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] bg-[#F8F7FA]">
              {url}
            </div>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label="画像URLを開く"
              className="shrink-0 text-[#6B6885] hover:text-[#7C3AED] p-2 rounded-lg border border-[#E8E6F0] hover:border-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
            >
              <ExternalLinkIcon className="w-4 h-4" />
            </a>
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label="画像URLを削除"
              className="shrink-0 text-[#6B6885] hover:text-[#EF4444] p-2 rounded-lg border border-[#E8E6F0] hover:border-[#EF4444] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
        {imageUrls.length === 0 && (
          <p className="text-xs text-[#6B6885] py-2">画像URLはまだ登録されていません。</p>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          type="url"
          value={newUrl}
          onChange={(event) => setNewUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd();
            }
          }}
          placeholder="https://example.com/image.jpg"
          className="flex-1 rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold text-[#7C3AED] border border-[#7C3AED] hover:bg-[#F3F0FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          追加
        </button>
      </div>
    </div>
  );
}
