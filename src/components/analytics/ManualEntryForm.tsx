"use client";

import { useState } from "react";
import { PlusIcon } from "@/components/icons";
import { accountNames, genreNames } from "./sampleData";
import type { Post } from "./types";

interface ManualEntryFormProps {
  onAdd: (post: Post) => void;
}

export function ManualEntryForm({ onAdd }: ManualEntryFormProps) {
  const [title, setTitle] = useState("");
  const [accountName, setAccountName] = useState(accountNames[0]);
  const [genre, setGenre] = useState(genreNames[0]);
  const [postedAt, setPostedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [shares, setShares] = useState("");
  const [saves, setSaves] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    onAdd({
      id: `post-manual-${Date.now()}`,
      ideaId: `manual-${Date.now()}`,
      ideaTitle: title.trim(),
      accountName,
      platform: accountName === "ライフハック部" ? "Instagram" : accountName === "旅とグルメ" ? "YouTube" : "TikTok",
      postedAt: new Date(postedAt).toISOString(),
      genre,
      views: Number(views) || 0,
      likes: Number(likes) || 0,
      comments: Number(comments) || 0,
      shares: Number(shares) || 0,
      saves: Number(saves) || 0,
    });

    setTitle("");
    setViews("");
    setLikes("");
    setComments("");
    setShares("");
    setSaves("");
  }

  return (
    <section aria-labelledby="manual-entry-title" className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm">
      <h2 id="manual-entry-title" className="text-lg font-bold text-[#2D2B55] mb-4">投稿実績を手動追加</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-2">
          <label htmlFor="manual-title" className="block text-xs font-medium text-[#6B6885] mb-1">
            投稿タイトル
          </label>
          <input
            id="manual-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            placeholder="投稿タイトルを入力"
            className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
          />
        </div>

        <div>
          <label htmlFor="manual-account" className="block text-xs font-medium text-[#6B6885] mb-1">
            アカウント
          </label>
          <select
            id="manual-account"
            value={accountName}
            onChange={(event) => setAccountName(event.target.value)}
            className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
          >
            {accountNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="manual-genre" className="block text-xs font-medium text-[#6B6885] mb-1">
            ジャンル
          </label>
          <select
            id="manual-genre"
            value={genre}
            onChange={(event) => setGenre(event.target.value)}
            className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
          >
            {genreNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="manual-posted-at" className="block text-xs font-medium text-[#6B6885] mb-1">
            投稿日
          </label>
          <input
            id="manual-posted-at"
            type="date"
            value={postedAt}
            onChange={(event) => setPostedAt(event.target.value)}
            className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
          />
        </div>

        <div>
          <label htmlFor="manual-views" className="block text-xs font-medium text-[#6B6885] mb-1">
            再生数
          </label>
          <input
            id="manual-views"
            type="number"
            min="0"
            value={views}
            onChange={(event) => setViews(event.target.value)}
            className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
          />
        </div>

        <div>
          <label htmlFor="manual-likes" className="block text-xs font-medium text-[#6B6885] mb-1">
            いいね
          </label>
          <input
            id="manual-likes"
            type="number"
            min="0"
            value={likes}
            onChange={(event) => setLikes(event.target.value)}
            className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
          />
        </div>

        <div>
          <label htmlFor="manual-comments" className="block text-xs font-medium text-[#6B6885] mb-1">
            コメント
          </label>
          <input
            id="manual-comments"
            type="number"
            min="0"
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
          />
        </div>

        <div>
          <label htmlFor="manual-shares" className="block text-xs font-medium text-[#6B6885] mb-1">
            シェア
          </label>
          <input
            id="manual-shares"
            type="number"
            min="0"
            value={shares}
            onChange={(event) => setShares(event.target.value)}
            className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
          />
        </div>

        <div>
          <label htmlFor="manual-saves" className="block text-xs font-medium text-[#6B6885] mb-1">
            保存数
          </label>
          <input
            id="manual-saves"
            type="number"
            min="0"
            value={saves}
            onChange={(event) => setSaves(event.target.value)}
            className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
          />
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            className="flex items-center justify-center gap-1.5 w-full px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold rounded-lg shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            追加
          </button>
        </div>
      </form>
    </section>
  );
}
