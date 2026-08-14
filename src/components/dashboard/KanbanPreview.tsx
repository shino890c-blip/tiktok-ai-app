"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { PlusIcon, ChevronRightIcon } from "@/components/icons";
import type { ProductionTask } from "@/components/production/types";

interface Card {
  id: string;
  title: string;
  category: string;
  author: string;
  due: string;
  progress: number;
  imageColor: string;
  actions?: { label: string; variant: "primary" | "secondary"; onClick?: () => void }[];
}

interface KanbanPreviewProps {
  tasks?: ProductionTask[];
}

const IMAGE_COLORS = ["bg-[#3730A3]", "bg-[#A78BFA]", "bg-[#6D28D9]", "bg-[#F59E0B]", "bg-[#EC4899]", "bg-[#14B8A6]", "bg-[#8B5CF6]", "bg-[#3B82F6]", "bg-[#EF4444]"];

const DUE_LABELS = ["今日まで", "明日まで", "2日後まで", "3日後まで"];

function taskToCard(task: ProductionTask, index: number): Card {
  return {
    id: task.id,
    title: task.title,
    category: task.genre,
    author: task.assigneeMemo || "未割り当て",
    due: DUE_LABELS[index % DUE_LABELS.length],
    progress: Math.min(95, 30 + task.orderIndex * 15),
    imageColor: IMAGE_COLORS[index % IMAGE_COLORS.length],
  };
}

function buildColumnsFromTasks(tasks: ProductionTask[]) {
  const planning = tasks.filter((t) => t.status === "planning" || t.status === "script");
  const producing = tasks.filter((t) => t.status === "producing");
  const review = tasks.filter((t) => t.status === "review");

  return [
    {
      id: "planning",
      title: "企画・台本作成中",
      count: planning.length,
      color: "bg-[#7C3AED]",
      cards: planning.slice(0, 3).map(taskToCard),
    },
    {
      id: "editing",
      title: "撮影・編集中",
      count: producing.length,
      color: "bg-[#0EA5E9]",
      cards: producing.slice(0, 3).map(taskToCard),
    },
    {
      id: "review",
      title: "確認・承認待ち",
      count: review.length,
      color: "bg-[#F59E0B]",
      cards: review.slice(0, 3).map((task, index) => ({
        ...taskToCard(task, index),
        actions: [
          { label: "却下", variant: "secondary" as const },
          { label: "承認する", variant: "primary" as const },
        ],
      })),
    },
  ];
}

const fallbackColumns: { id: string; title: string; count: number; color: string; cards: Card[] }[] = [
  {
    id: "planning",
    title: "企画・台本作成中",
    count: 9,
    color: "bg-[#7C3AED]",
    cards: [
      { id: "p1", title: "深夜のドライブで聴きたい曲", category: "音楽・プレイリスト", author: "佐藤", due: "今日まで", progress: 30, imageColor: "bg-[#3730A3]" },
      { id: "p2", title: "毛穴を消すスキンケア3選", category: "美容・スキンケア", author: "田中", due: "明日まで", progress: 45, imageColor: "bg-[#A78BFA]" },
      { id: "p3", title: "時短家電がマジで便利", category: "ライフスタイル・家電", author: "鈴木", due: "2日後まで", progress: 60, imageColor: "bg-[#6D28D9]" },
    ],
  },
  {
    id: "editing",
    title: "撮影・編集中",
    count: 11,
    color: "bg-[#0EA5E9]",
    cards: [
      { id: "e1", title: "レンジで作る爆速レシピ", category: "料理・時短レシピ", author: "高橋", due: "今日まで", progress: 60, imageColor: "bg-[#F59E0B]" },
      { id: "e2", title: "夏に買うべき服TOP5", category: "ファッション", author: "佐藤", due: "明日まで", progress: 40, imageColor: "bg-[#EC4899]" },
      { id: "e3", title: "沖縄旅行Vlog #1", category: "旅行・Vlog", author: "山本", due: "3日後まで", progress: 70, imageColor: "bg-[#14B8A6]" },
    ],
  },
  {
    id: "review",
    title: "確認・承認待ち",
    count: 7,
    color: "bg-[#F59E0B]",
    cards: [
      { id: "r1", title: "猫のかわいい瞬間集 #3", category: "ペット・猫", author: "鈴木", due: "今日まで", progress: 90, imageColor: "bg-[#8B5CF6]", actions: [
        { label: "却下", variant: "secondary" },
        { label: "承認する", variant: "primary" },
      ]},
      { id: "r2", title: "集中力が上がる勉強法", category: "学習・自己啓発", author: "田中", due: "明日まで", progress: 85, imageColor: "bg-[#3B82F6]", actions: [
        { label: "却下", variant: "secondary" },
        { label: "承認する", variant: "primary" },
      ]},
      { id: "r3", title: "東京ナイトスポット5選", category: "旅行・観光", author: "高橋", due: "2日後まで", progress: 95, imageColor: "bg-[#EF4444]", actions: [
        { label: "却下", variant: "secondary" },
        { label: "承認する", variant: "primary" },
      ]},
    ],
  },
];

function KanbanCard({ card }: { card: Card }) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      className="bg-white rounded-lg border border-[#E8E6F0] p-3 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex gap-3">
        <div className={`w-16 h-16 rounded-md ${card.imageColor} shrink-0`} />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-[#2D2B55] truncate">{card.title}</h4>
          <p className="text-xs text-[#6B6885] mt-0.5">{card.category}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-5 h-5 rounded-full bg-[#E8E6F0]" />
            <span className="text-xs text-[#6B6885]">{card.author}</span>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[#EF4444] font-medium">{card.due}</span>
          <span className="text-[#6B6885]">{card.progress}%</span>
        </div>
        <div className="h-1.5 bg-[#F3F0FF] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#7C3AED] rounded-full transition-all duration-500"
            style={{ width: `${card.progress}%` }}
          />
        </div>
      </div>
      {card.actions && card.actions.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          {card.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] ${
                action.variant === "primary"
                  ? "bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                  : "bg-white text-[#2D2B55] border border-[#E8E6F0] hover:border-[#7C3AED] hover:text-[#7C3AED]"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </motion.article>
  );
}

export function KanbanPreview({ tasks }: KanbanPreviewProps) {
  const columnCards = useMemo(() => {
    if (tasks && tasks.length > 0) return buildColumnsFromTasks(tasks);
    return fallbackColumns;
  }, [tasks]);

  return (
    <section aria-labelledby="kanban-title" className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h2 id="kanban-title" className="text-lg font-bold text-[#2D2B55]">コンテンツ制作の進捗（プレビュー）</h2>
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium text-[#7C3AED] hover:text-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded px-2 py-1 transition-colors"
        >
          すべての制作を見る
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {columnCards.map((column) => (
          <div key={column.id} className="flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-1 h-4 rounded-full ${column.color}`} />
                <h3 className="text-sm font-bold text-[#2D2B55]">{column.title}</h3>
                <span className="text-xs text-[#6B6885] bg-[#F8F7FA] px-2 py-0.5 rounded-full">{column.count}</span>
              </div>
              <button
                type="button"
                aria-label={`${column.title}に追加`}
                className="text-[#6B6885] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded p-1 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {column.cards.map((card) => (
                <KanbanCard key={card.id} card={card} />
              ))}
            </div>

            <button
              type="button"
              className="mt-3 flex items-center gap-1 text-sm text-[#6B6885] hover:text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded px-2 py-1.5 transition-colors self-start"
            >
              <PlusIcon className="w-4 h-4" />
              さらに表示
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
