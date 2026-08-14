"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { InfoIcon, PlayIcon, BoardIcon, UploadIcon, DollarIcon } from "@/components/icons";
import type { ProductionTask } from "@/components/production/types";
import type { Schedule } from "@/components/calendar/types";
import type { Revenue } from "@/components/revenue/types";

interface MetricsBarProps {
  tasks?: ProductionTask[];
  schedules?: Schedule[];
  revenues?: Revenue[];
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function formatCurrency(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

export function MetricsBar({ tasks, schedules, revenues }: MetricsBarProps) {
  const metrics = useMemo(() => {
    const activeTasks = tasks?.filter((t) => t.status !== "done").length ?? 12;
    const producingCount = tasks?.filter((t) => t.status === "producing" || t.status === "script").length ?? 27;
    const todaysSchedules = schedules?.filter((s) => isToday(s.scheduledAt)).length ?? 5;
    const weekSchedules = schedules?.length ?? 18;
    const monthlyRevenue =
      revenues
        ?.filter((r) => isThisMonth(r.recordDate))
        .reduce((sum, r) => sum + r.amount, 0) ?? 1248300;

    return [
      {
        id: "today",
        label: "本日のタスク",
        value: String(activeTasks),
        sub: "期限内 8 / 遅延 ",
        subAccent: "4",
        icon: PlayIcon,
        iconBg: "bg-[#F3F0FF]",
        iconColor: "text-[#7C3AED]",
      },
      {
        id: "progress",
        label: "制作中コンテンツ",
        value: String(producingCount),
        sub: "前日比 ",
        subAccent: "+5",
        icon: BoardIcon,
        iconBg: "bg-[#FFF7ED]",
        iconColor: "text-[#F59E0B]",
      },
      {
        id: "scheduled",
        label: "本日の投稿予定",
        value: String(todaysSchedules),
        sub: "今週合計 ",
        subAccent: String(weekSchedules),
        icon: UploadIcon,
        iconBg: "bg-[#E0F2FE]",
        iconColor: "text-[#0EA5E9]",
      },
      {
        id: "revenue",
        label: "推定収益（今月）",
        value: formatCurrency(monthlyRevenue),
        sub: "前月比 ",
        subAccent: "+18.6%",
        icon: DollarIcon,
        iconBg: "bg-[#DCFCE7]",
        iconColor: "text-[#22C55E]",
      },
    ];
  }, [tasks, schedules, revenues]);

  return (
    <section aria-label="本日の主要指標" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {metrics.map((metric, index) => {
        const Icon = metric.icon;
        return (
          <motion.article
            key={metric.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.08 }}
            className="group bg-white rounded-xl border border-[#E8E6F0] p-4 flex items-center justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className={`w-11 h-11 rounded-full ${metric.iconBg} ${metric.iconColor} flex items-center justify-center shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1 text-xs text-[#6B6885] mb-1">
                  {metric.label}
                  <InfoIcon className="w-3.5 h-3.5" />
                </div>
                <div className="text-2xl font-bold text-[#2D2B55]">{metric.value}</div>
                <div className="text-xs text-[#6B6885]">
                  {metric.sub}
                  <span className="text-[#7C3AED] font-semibold">{metric.subAccent}</span>
                </div>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#F8F7FA] text-[#6B6885] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </motion.article>
        );
      })}
    </section>
  );
}
