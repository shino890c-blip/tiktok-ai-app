"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Toast } from "@/components/ui/Toast";
import { Filters } from "@/components/analytics/Filters";
import { ViewsTrendChart } from "@/components/analytics/ViewsTrendChart";
import { EngagementBarChart } from "@/components/analytics/EngagementBarChart";
import { GenrePieChart } from "@/components/analytics/GenrePieChart";
import { PostsTable } from "@/components/analytics/PostsTable";
import { ManualEntryForm } from "@/components/analytics/ManualEntryForm";
import { CsvImportButton } from "@/components/analytics/CsvImportButton";
import { getPosts } from "@/lib/data/posts";
import type { PeriodOption, Post } from "@/components/analytics/types";

function getPeriodStart(period: PeriodOption): Date | null {
  const now = new Date();
  if (period === "7d") {
    now.setDate(now.getDate() - 7);
    return now;
  }
  if (period === "30d") {
    now.setDate(now.getDate() - 30);
    return now;
  }
  if (period === "90d") {
    now.setDate(now.getDate() - 90);
    return now;
  }
  return null;
}

export default function AnalyticsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodOption>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [account, setAccount] = useState("all");
  const [genre, setGenre] = useState("all");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPosts()
      .then((data) => {
        if (!cancelled) setPosts(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("投稿実績の取得に失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  }

  const filteredPosts = useMemo(() => {
    let result = posts;

    if (period === "custom") {
      if (customStart) {
        const start = new Date(customStart);
        result = result.filter((post) => new Date(post.postedAt) >= start);
      }
      if (customEnd) {
        const end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
        result = result.filter((post) => new Date(post.postedAt) <= end);
      }
    } else {
      const start = getPeriodStart(period);
      if (start) {
        result = result.filter((post) => new Date(post.postedAt) >= start);
      }
    }

    if (account !== "all") {
      result = result.filter((post) => post.accountName === account);
    }
    if (genre !== "all") {
      result = result.filter((post) => post.genre === genre);
    }

    return result.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
  }, [posts, period, customStart, customEnd, account, genre]);

  function handleManualAdd(post: Post) {
    setPosts((prev) => [post, ...prev]);
    showToast("投稿実績を追加しました");
  }

  function handleCsvImport(imported: Post[]) {
    setPosts((prev) => [...imported, ...prev]);
    showToast(`${imported.length}件の投稿実績をインポートしました`);
  }

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-[#E8E6F0] px-4 pl-14 sm:pl-16 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#2D2B55]">分析</h1>
              <p className="text-sm text-[#6B6885] mt-1">投稿実績を確認し、伸びているコンテンツの傾向を把握しましょう。</p>
            </div>
            <CsvImportButton onImport={handleCsvImport} />
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          <Filters
            period={period}
            onPeriodChange={setPeriod}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            account={account}
            onAccountChange={setAccount}
            genre={genre}
            onGenreChange={setGenre}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ViewsTrendChart posts={filteredPosts} />
            <EngagementBarChart posts={filteredPosts} />
          </div>

          <GenrePieChart posts={filteredPosts} />

          <ManualEntryForm onAdd={handleManualAdd} />

          {loadError && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#E8E6F0] bg-white py-16 text-center shadow-sm">
              <p className="text-sm text-[#6B6885]">読み込み中...</p>
            </div>
          ) : (
            <PostsTable posts={filteredPosts} />
          )}
        </div>
      </main>

      <Toast message={toastMessage} />
    </div>
  );
}
