"use client";

import { useEffect, useMemo, useState } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Toast } from "@/components/ui/Toast";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import { MonthView } from "@/components/calendar/MonthView";
import { WeekView } from "@/components/calendar/WeekView";
import { ScheduleModal } from "@/components/calendar/ScheduleModal";
import { getSchedules } from "@/lib/data/schedules";
import type { Schedule } from "@/components/calendar/types";

type ViewMode = "month" | "week";

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month, day);
}

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSchedules()
      .then((data) => {
        if (!cancelled) setSchedules(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("投稿予定の取得に失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const headerLabel = useMemo(() => {
    if (viewMode === "month") {
      return currentDate.toLocaleDateString("ja-JP", { year: "numeric", month: "long" });
    }
    const weekStart = new Date(currentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return `${weekStart.toLocaleDateString("ja-JP", { month: "long", day: "numeric" })} - ${weekEnd.toLocaleDateString("ja-JP", { month: "long", day: "numeric" })}`;
  }, [currentDate, viewMode]);

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  }

  function handlePrev() {
    const next = new Date(currentDate);
    if (viewMode === "month") {
      next.setMonth(next.getMonth() - 1);
    } else {
      next.setDate(next.getDate() - 7);
    }
    setCurrentDate(next);
  }

  function handleNext() {
    const next = new Date(currentDate);
    if (viewMode === "month") {
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }
    setCurrentDate(next);
  }

  function handleToday() {
    setCurrentDate(new Date());
  }

  function handleDayClick(date: Date) {
    setModalDate(date);
    setEditingSchedule(null);
    setModalOpen(true);
  }

  function handleScheduleClick(schedule: Schedule) {
    setEditingSchedule(schedule);
    setModalDate(null);
    setModalOpen(true);
  }

  function handleSave(schedule: Schedule) {
    setSchedules((prev) => {
      const exists = prev.some((item) => item.id === schedule.id);
      if (exists) {
        return prev.map((item) => (item.id === schedule.id ? schedule : item));
      }
      return [...prev, schedule];
    });
    setModalOpen(false);
    showToast(editingSchedule ? "投稿予定を更新しました" : "投稿予定を追加しました");
  }

  function handleDelete(id: string) {
    setSchedules((prev) => prev.filter((item) => item.id !== id));
    setModalOpen(false);
    showToast("投稿予定を削除しました");
  }

  function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const targetDate = parseDayKey(destination.droppableId);
    setSchedules((prev) =>
      prev.map((schedule) => {
        if (schedule.id !== draggableId) return schedule;
        const original = new Date(schedule.scheduledAt);
        const updated = new Date(targetDate);
        updated.setHours(original.getHours(), original.getMinutes(), 0, 0);
        return { ...schedule, scheduledAt: updated.toISOString() };
      })
    );
    showToast("投稿予定の日時を変更しました");
  }

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-[#E8E6F0] px-4 pl-14 sm:pl-16 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#2D2B55]">投稿カレンダー</h1>
              <p className="text-sm text-[#6B6885] mt-1">投稿予定の管理とスケジュール調整ができます。</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDayClick(new Date())}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold rounded-lg shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                新規投稿予定
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 space-y-4">
          <div className="bg-white rounded-xl border border-[#E8E6F0] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="前へ"
                className="p-2 rounded-lg border border-[#E8E6F0] text-[#6B6885] hover:border-[#7C3AED] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
              >
                <ChevronRightIcon className="w-4 h-4 rotate-180" />
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="px-3 py-2 rounded-lg border border-[#E8E6F0] text-sm font-medium text-[#2D2B55] hover:border-[#7C3AED] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
              >
                今日
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="次へ"
                className="p-2 rounded-lg border border-[#E8E6F0] text-[#6B6885] hover:border-[#7C3AED] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
              <span className="text-base font-bold text-[#2D2B55] ml-2">{headerLabel}</span>
            </div>

            <div className="inline-flex items-center rounded-lg border border-[#E8E6F0] p-1 bg-[#F8F7FA] self-start">
              {(["month", "week"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                    viewMode === mode ? "bg-white text-[#7C3AED] shadow-sm" : "text-[#6B6885] hover:text-[#2D2B55]"
                  }`}
                >
                  {mode === "month" ? "月表示" : "週表示"}
                </button>
              ))}
            </div>
          </div>

          <DragDropContext onDragEnd={handleDragEnd}>
            <section className="bg-white rounded-xl border border-[#E8E6F0] p-4 shadow-sm">
              {loadError && (
                <div className="mb-4 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                  {loadError}
                </div>
              )}
              {isLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <p className="text-sm text-[#6B6885]">読み込み中...</p>
                </div>
              ) : viewMode === "month" ? (
                <MonthView
                  currentDate={currentDate}
                  schedules={schedules}
                  onDayClick={handleDayClick}
                  onScheduleClick={handleScheduleClick}
                />
              ) : (
                <WeekView
                  currentDate={currentDate}
                  schedules={schedules}
                  onDayClick={handleDayClick}
                  onScheduleClick={handleScheduleClick}
                />
              )}
            </section>
          </DragDropContext>
        </div>
      </main>

      <ScheduleModal
        open={modalOpen}
        initialDate={modalDate}
        schedule={editingSchedule}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <Toast message={toastMessage} />
    </div>
  );
}
