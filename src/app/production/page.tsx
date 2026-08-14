"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { ProductionBoard } from "@/components/production/ProductionBoard";
import { getTasks } from "@/lib/data/production-tasks";
import type { ProductionTask } from "@/components/production/types";

export default function ProductionPage() {
  const [tasks, setTasks] = useState<ProductionTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTasks()
      .then((data) => {
        if (!cancelled) setTasks(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("制作タスクの取得に失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-[#E8E6F0] px-4 pl-14 sm:pl-16 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-[#2D2B55]">制作ボード</h1>
          <p className="text-sm text-[#6B6885] mt-1">
            企画から完成まで、コンテンツ制作の進行状況をカンバンで管理します。カードをドラッグしてステータスを変更できます。
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
            <ProductionBoard initialTasks={tasks} />
          )}
        </div>
      </main>
    </div>
  );
}
