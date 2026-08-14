"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { IdeaCard } from "@/components/ideas/IdeaCard";
import { IdeaFilterBar } from "@/components/ideas/IdeaFilterBar";
import { IdeaFormModal } from "@/components/ideas/IdeaFormModal";
import { Toast } from "@/components/ui/Toast";
import { PlusIcon } from "@/components/icons";
import { getIdeas } from "@/lib/data/ideas";
import type { Idea, IdeaFormValues, IdeaStatus, SortKey } from "@/components/ideas/types";

function createIdeaId(): string {
  return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateMockScore(): number {
  return Math.floor(Math.random() * 101);
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [genreFilter, setGenreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<IdeaStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("date-desc");
  const [formOpen, setFormOpen] = useState(false);
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getIdeas()
      .then((data) => {
        if (!cancelled) setIdeas(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("ネタ一覧の取得に失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2200);
  };

  const filteredIdeas = useMemo(() => {
    let result = ideas;

    if (genreFilter !== "all") {
      result = result.filter((idea) => idea.genre === genreFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((idea) => idea.status === statusFilter);
    }

    result = [...result].sort((a, b) => {
      if (sortKey === "score-desc") {
        return (b.aiScore ?? -1) - (a.aiScore ?? -1);
      }
      if (sortKey === "date-asc") {
        return a.createdAt.localeCompare(b.createdAt);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

    return result;
  }, [ideas, genreFilter, statusFilter, sortKey]);

  const handleFormSubmit = (values: IdeaFormValues) => {
    const newIdea: Idea = {
      id: createIdeaId(),
      title: values.title,
      description: values.description,
      genre: values.genre,
      aiScore: null,
      status: "draft",
      isDuplicate: false,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setIdeas((prev) => [newIdea, ...prev]);
    setFormOpen(false);
    showToast("ネタを追加しました");
  };

  const handleScore = (id: string) => {
    setScoringId(id);
    setTimeout(() => {
      const score = generateMockScore();
      setIdeas((prev) => prev.map((idea) => (idea.id === id ? { ...idea, aiScore: score } : idea)));
      setScoringId(null);
      showToast(`AIスコアリングが完了しました（${score}点）`);
    }, 900);
  };

  const handleApprove = (id: string) => {
    setIdeas((prev) => prev.map((idea) => (idea.id === id ? { ...idea, status: "approved" } : idea)));
    showToast("ネタを承認しました");
  };

  const handleReject = (id: string) => {
    setIdeas((prev) => prev.map((idea) => (idea.id === id ? { ...idea, status: "rejected" } : idea)));
    showToast("ネタを却下しました");
  };

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-[#E8E6F0] px-4 pl-14 sm:pl-16 lg:px-8 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#2D2B55]">ネタ管理</h1>
              <p className="text-sm text-[#6B6885] mt-1">
                動画ネタの企画・AIスコアリング・承認フローを管理します。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#7C3AED] text-white rounded-lg text-sm font-semibold shadow-md hover:bg-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              新規ネタを追加
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          <IdeaFilterBar
            genreFilter={genreFilter}
            statusFilter={statusFilter}
            sortKey={sortKey}
            onGenreFilterChange={setGenreFilter}
            onStatusFilterChange={setStatusFilter}
            onSortKeyChange={setSortKey}
          />

          <p className="text-sm text-[#6B6885]">
            {filteredIdeas.length}件のネタ（全{ideas.length}件）
          </p>

          {loadError && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#E8E6F0] bg-white py-16 text-center shadow-sm">
              <p className="text-sm text-[#6B6885]">読み込み中...</p>
            </div>
          ) : filteredIdeas.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#E8E6F0] bg-white py-16 text-center shadow-sm">
              <p className="text-sm text-[#6B6885]">条件に一致するネタがありません。</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredIdeas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  isScoring={scoringId === idea.id}
                  onScore={handleScore}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <IdeaFormModal open={formOpen} onSubmit={handleFormSubmit} onClose={() => setFormOpen(false)} />

      <Toast message={toastMessage} />
    </div>
  );
}
