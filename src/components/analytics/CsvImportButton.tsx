"use client";

import { useRef, useState } from "react";
import { UploadIcon, AlertTriangleIcon } from "@/components/icons";
import { accountNames, genreNames } from "./sampleData";
import type { Post } from "./types";

interface CsvImportButtonProps {
  onImport: (posts: Post[]) => void;
}

const expectedHeader = ["投稿日", "タイトル", "再生数", "いいね", "コメント", "シェア", "保存"];

function parseCsv(text: string): string[][] {
  return text
    .split(/\r\n|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(","));
}

export function CsvImportButton({ onImport }: CsvImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const rows = parseCsv(text);

      if (rows.length < 2) {
        setError("CSVにデータ行がありません。");
        return;
      }

      const header = rows[0].map((cell) => cell.trim());
      const isValidHeader = expectedHeader.every((col, index) => header[index] === col);
      if (!isValidHeader) {
        setError("CSVのフォーマットが正しくありません。ヘッダーを確認してください。");
        return;
      }

      const posts: Post[] = rows.slice(1).map((row, index) => {
        const [postedDate, titleValue, viewsValue, likesValue, commentsValue, sharesValue, savesValue] = row;
        return {
          id: `post-csv-${Date.now()}-${index}`,
          ideaId: `csv-${Date.now()}-${index}`,
          ideaTitle: titleValue?.trim() || "無題の投稿",
          accountName: accountNames[index % accountNames.length],
          platform: "TikTok",
          postedAt: new Date(postedDate?.trim() || Date.now()).toISOString(),
          genre: genreNames[index % genreNames.length],
          views: Number(viewsValue) || 0,
          likes: Number(likesValue) || 0,
          comments: Number(commentsValue) || 0,
          shares: Number(sharesValue) || 0,
          saves: Number(savesValue) || 0,
        };
      });

      setError(null);
      onImport(posts);
    };
    reader.onerror = () => setError("ファイルの読み込みに失敗しました。");
    reader.readAsText(file, "utf-8");

    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 px-4 py-2 bg-white border border-[#E8E6F0] rounded-lg text-sm font-semibold text-[#2D2B55] hover:border-[#7C3AED] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
      >
        <UploadIcon className="w-4 h-4" />
        CSVインポート
      </button>
      <input ref={inputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-[#EF4444]">
          <AlertTriangleIcon className="w-3.5 h-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}
