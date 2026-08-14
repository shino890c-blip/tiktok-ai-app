"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { MetricsBar } from "@/components/dashboard/MetricsBar";
import { KanbanPreview } from "@/components/dashboard/KanbanPreview";
import { ViewsChart } from "@/components/dashboard/ViewsChart";
import { AIInsightPanel } from "@/components/dashboard/AIInsightPanel";
import { CalendarIcon, ChevronRightIcon } from "@/components/icons";
import { getTasks } from "@/lib/data/production-tasks";
import { getSchedules } from "@/lib/data/schedules";
import { getRevenues } from "@/lib/data/revenues";
import { getPosts } from "@/lib/data/posts";
import type { ProductionTask } from "@/components/production/types";
import type { Schedule } from "@/components/calendar/types";
import type { Revenue } from "@/components/revenue/types";
import type { Post } from "@/components/analytics/types";

export default function DashboardPage() {
  const [currentDate] = useState("2025年5月19日（月）");
  const [tasks, setTasks] = useState<ProductionTask[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTasks(), getSchedules(), getRevenues(), getPosts()])
      .then(([taskData, scheduleData, revenueData, postData]) => {
        if (cancelled) return;
        setTasks(taskData);
        setSchedules(scheduleData);
        setRevenues(revenueData);
        setPosts(postData);
      })
      .catch(() => {
        if (!cancelled) setLoadError("ダッシュボードデータの取得に失敗しました。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex">
      <Sidebar />

      <main className="flex-1 min-w-0 lg:ml-0">
        <header className="bg-white border-b border-[#E8E6F0] px-4 pl-14 sm:pl-16 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#2D2B55]">ダッシュボード</h1>
              <p className="text-sm text-[#6B6885] mt-1">今日のタスクを確認し、コンテンツを承認して公開を加速させましょう。</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E8E6F0] rounded-lg text-sm text-[#2D2B55] hover:border-[#7C3AED] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
              >
                <CalendarIcon className="w-4 h-4" />
                {currentDate}
                <ChevronRightIcon className="w-4 h-4 rotate-90" />
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          {loadError && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
            </div>
          )}

          <MetricsBar tasks={tasks} schedules={schedules} revenues={revenues} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <KanbanPreview tasks={tasks} />
              <ViewsChart posts={posts} />
            </div>

            <div className="lg:col-span-1">
              <AIInsightPanel />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
