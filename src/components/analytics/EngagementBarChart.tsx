"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { Post } from "./types";

function formatNumber(value: number): string {
  return value.toLocaleString("ja-JP");
}

interface EngagementBarChartProps {
  posts: Post[];
}

export function EngagementBarChart({ posts }: EngagementBarChartProps) {
  const totals = posts.reduce(
    (acc, post) => {
      acc.likes += post.likes;
      acc.comments += post.comments;
      acc.shares += post.shares;
      return acc;
    },
    { likes: 0, comments: 0, shares: 0 }
  );

  const data = [
    { name: "いいね", value: totals.likes, fill: "#7C3AED" },
    { name: "コメント", value: totals.comments, fill: "#3B82F6" },
    { name: "シェア", value: totals.shares, fill: "#F59E0B" },
  ];

  return (
    <section aria-labelledby="engagement-title" className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm">
      <h2 id="engagement-title" className="text-lg font-bold text-[#2D2B55] mb-4">いいね・コメント・シェア比較</h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F0" />
            <XAxis dataKey="name" tick={{ fill: "#6B6885", fontSize: 12 }} axisLine={{ stroke: "#E8E6F0" }} tickLine={false} />
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
              formatter={(value) => {
                const num = typeof value === "number" ? value : Number(value);
                return [formatNumber(num), "件数"];
              }}
            />
            <Legend />
            <Bar dataKey="value" name="件数" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
