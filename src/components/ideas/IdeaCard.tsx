"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangleIcon, CheckIcon, ExternalLinkIcon, SparkleIcon, XCircleIcon } from "@/components/icons";
import { ScoreBadge } from "@/components/ideas/ScoreBadge";
import { StatusBadge } from "@/components/ideas/StatusBadge";
import type { Idea } from "@/components/ideas/types";

interface IdeaCardProps {
  idea: Idea;
  isScoring: boolean;
  onScore: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

/** ネタ1件分の情報とアクションボタンを表示するカード。 */
export function IdeaCard({ idea, isScoring, onScore, onApprove, onReject }: IdeaCardProps) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border border-[#E8E6F0] bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[#2D2B55]">{idea.title}</h3>
            {idea.isDuplicate && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2.5 py-1 text-xs font-semibold text-[#F59E0B]">
                <AlertTriangleIcon className="w-3.5 h-3.5" />
                重複の可能性
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-[#6B6885] leading-relaxed">{idea.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#F8F7FA] px-2.5 py-1 text-xs font-medium text-[#6B6885]">
              {idea.genre}
            </span>
            <StatusBadge status={idea.status} />
            <ScoreBadge score={idea.aiScore} />
            <span className="text-xs text-[#6B6885]">{idea.createdAt}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
          <button
            type="button"
            onClick={() => onScore(idea.id)}
            disabled={isScoring}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[#E8E6F0] px-3 py-2 text-xs font-semibold text-[#2D2B55] hover:border-[#7C3AED] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SparkleIcon className="w-3.5 h-3.5" />
            {isScoring ? "採点中..." : "AIスコアリング"}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onApprove(idea.id)}
              disabled={idea.status === "approved"}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#22C55E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#16A34A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckIcon className="w-3.5 h-3.5" />
              承認
            </button>
            <button
              type="button"
              onClick={() => onReject(idea.id)}
              disabled={idea.status === "rejected"}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#E8E6F0] px-3 py-2 text-xs font-semibold text-[#2D2B55] hover:border-[#EF4444] hover:text-[#EF4444] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <XCircleIcon className="w-3.5 h-3.5" />
              却下
            </button>
          </div>

          <Link
            href={`/scripts/${idea.id}`}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-2 text-xs font-semibold text-white hover:bg-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
          >
            台本を作成
            <ExternalLinkIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
