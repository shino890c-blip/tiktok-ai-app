"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { Post } from "./types";

const palette = ["#7C3AED", "#3B82F6", "#F59E0B", "#22C55E", "#EC4899", "#14B8A6"];

function formatNumber(value: number): string {
  return value.toLocaleString("ja-JP");
}

interface GenrePieChartProps {
  posts: Post[];
}

export function GenrePieChart({ posts }: GenrePieChartProps) {
  const byGenre = new Map<string, number>();
  for (const post of posts) {
    byGenre.set(post.genre, (byGenre.get(post.genre) ?? 0) + post.views);
  }
  const data = Array.from(byGenre.entries()).map(([name, value]) => ({ name, value }));

  return (
    <section aria-labelledby="genre-title" className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm">
      <h2 id="genre-title" className="text-lg font-bold text-[#2D2B55] mb-4">ジャンル別再生数構成比</h2>
      <div className="h-64 w-full">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-[#6B6885]">データがありません</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(Number(percent) * 100).toFixed(0)}%`}>
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={palette[index % palette.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#FFFFFF",
                  border: "1px solid #E8E6F0",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(45, 43, 85, 0.1)",
                }}
                formatter={(value) => {
                  const num = typeof value === "number" ? value : Number(value);
                  return [formatNumber(num), "再生数"];
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
