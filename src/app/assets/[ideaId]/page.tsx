"use client";

import { use, useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { AssetManager } from "@/components/assets/AssetManager";
import { DEFAULT_IDEA_SUMMARY, createEmptyAsset } from "@/components/assets/types";
import type { Asset, IdeaSummary } from "@/components/assets/types";
import { getAsset } from "@/lib/data/assets";
import { getIdeas } from "@/lib/data/ideas";

export default function AssetsPage(props: PageProps<"/assets/[ideaId]">) {
  const { ideaId } = use(props.params);

  const [idea, setIdea] = useState<IdeaSummary>({ ...DEFAULT_IDEA_SUMMARY, ideaId });
  const [asset, setAsset] = useState<Asset>(createEmptyAsset(ideaId));
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAsset(ideaId), getIdeas()])
      .then(([assetData, ideas]) => {
        if (cancelled) return;
        setAsset(assetData);
        const matchedIdea = ideas.find((item) => item.id === ideaId);
        setIdea(
          matchedIdea
            ? {
                ideaId,
                title: matchedIdea.title,
                overview: matchedIdea.description,
                genre: matchedIdea.genre,
              }
            : { ...DEFAULT_IDEA_SUMMARY, ideaId }
        );
      })
      .catch(() => {
        if (!cancelled) setLoadError("素材情報の取得に失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ideaId]);

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-[#E8E6F0] px-4 pl-14 sm:pl-16 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-[#2D2B55]">素材管理</h1>
          <p className="text-sm text-[#6B6885] mt-1">
            ネタID: <span className="font-mono">{ideaId}</span> の動画素材・権利確認・承認状況を管理します。
          </p>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">
          {loadError && (
            <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#E8E6F0] bg-white py-16 text-center shadow-sm">
              <p className="text-sm text-[#6B6885]">読み込み中...</p>
            </div>
          ) : (
            <AssetManager idea={idea} initialAsset={asset} />
          )}
        </div>
      </main>
    </div>
  );
}
