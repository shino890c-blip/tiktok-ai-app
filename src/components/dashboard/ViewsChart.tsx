"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import type { Post } from "@/components/analytics/types";

interface ViewsChartProps {
  posts?: Post[];
}

const fallbackData = [
  { date: "5/13", views: 12500 },
  { date: "5/14", views: 18200 },
  { date: "5/15", views: 15400 },
  { date: "5/16", views: 24800 },
  { date: "5/17", views: 32100 },
  { date: "5/18", views: 28600 },
  { date: "5/19", views: 39400 },
];

function buildTrendFromPosts(posts: Post[]) {
  const byDate = new Map<string, number>();
  for (const post of posts) {
    const date = new Date(post.postedAt);
    const key = `${date.getMonth() + 1}/${date.getDate()}`;
    byDate.set(key, (byDate.get(key) ?? 0) + post.views);
  }

  const sorted = [...posts].sort(
    (a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime()
  );
  const lastDates: string[] = [];
  for (const post of sorted) {
    const date = new Date(post.postedAt);
    const key = `${date.getMonth() + 1}/${date.getDate()}`;
    if (!lastDates.includes(key)) lastDates.push(key);
  }
  const recentDates = lastDates.slice(-7);

  return recentDates.map((key) => ({ date: key, views: byDate.get(key) ?? 0 }));
}

function formatNumber(value: number): string {
  return value.toLocaleString("ja-JP");
}

export function ViewsChart({ posts }: ViewsChartProps) {
  const data = useMemo(() => {
    if (posts && posts.length > 0) {
      const trend = buildTrendFromPosts(posts);
      if (trend.length > 0) return trend;
    }
    return fallbackData;
  }, [posts]);

  return (
    <section aria-labelledby="views-title" className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 id="views-title" className="text-lg font-bold text-[#2D2B55]">直近7日間の再生数</h2>
        <div className="text-sm text-[#6B6885]">
          AIクッキングラボ
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="h-64 w-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F0" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#6B6885", fontSize: 12 }}
              axisLine={{ stroke: "#E8E6F0" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#6B6885", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => `${(value / 1000).toFixed(0)}K`}
            />
            <Tooltip
              contentStyle={{
                background: "#FFFFFF",
                border: "1px solid #E8E6F0",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(45, 43, 85, 0.1)",
              }}
              labelStyle={{ color: "#2D2B55", fontWeight: 600 }}
              itemStyle={{ color: "#7C3AED" }}
              formatter={(value) => {
                const num = typeof value === "number" ? value : Number(value);
                return [formatNumber(num), "再生数"];
              }}
            />
            <Line
              type="monotone"
              dataKey="views"
              stroke="#7C3AED"
              strokeWidth={3}
              dot={{ fill: "#7C3AED", strokeWidth: 2, r: 4, stroke: "#FFFFFF" }}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div className="bg-[#F8F7FA] rounded-lg p-3">
          <div className="text-xs text-[#6B6885]">合計再生数</div>
          <div className="text-base font-bold text-[#2D2B55]">171,000</div>
        </div>
        <div className="bg-[#F8F7FA] rounded-lg p-3">
          <div className="text-xs text-[#6B6885]">平均再生数</div>
          <div className="text-base font-bold text-[#2D2B55]">24,429</div>
        </div>
        <div className="bg-[#F8F7FA] rounded-lg p-3">
          <div className="text-xs text-[#6B6885]">前週比</div>
          <div className="text-base font-bold text-[#22C55E]">+23.5%</div>
        </div>
      </div>
    </section>
  );
}
