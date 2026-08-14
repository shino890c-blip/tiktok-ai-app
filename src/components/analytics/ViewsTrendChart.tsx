"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Post } from "./types";

function formatNumber(value: number): string {
  return value.toLocaleString("ja-JP");
}

interface ViewsTrendChartProps {
  posts: Post[];
}

export function ViewsTrendChart({ posts }: ViewsTrendChartProps) {
  const byDate = new Map<string, number>();
  for (const post of posts) {
    const date = new Date(post.postedAt);
    const key = date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
    byDate.set(key, (byDate.get(key) ?? 0) + post.views);
  }

  const data = Array.from(byDate.entries())
    .map(([date, views]) => ({ date, views, sortKey: new Date(date).getTime() }))
    .sort((a, b) => a.sortKey - b.sortKey);

  return (
    <section aria-labelledby="views-trend-title" className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm">
      <h2 id="views-trend-title" className="text-lg font-bold text-[#2D2B55] mb-4">再生数推移（日別）</h2>
      <div className="h-64 w-full">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-[#6B6885]">データがありません</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F0" />
              <XAxis dataKey="date" tick={{ fill: "#6B6885", fontSize: 12 }} axisLine={{ stroke: "#E8E6F0" }} tickLine={false} />
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
        )}
      </div>
    </section>
  );
}
