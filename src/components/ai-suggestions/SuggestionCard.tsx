"use client";

import { motion } from "framer-motion";
import type { AiSuggestion } from "./types";
import {
  SUGGESTION_TYPE_LABELS,
  CONFIDENCE_LABELS,
  CONFIDENCE_COLORS,
} from "./types";
import { SparkleIcon, CheckIcon, AlertTriangleIcon } from "@/components/icons";

interface SuggestionCardProps {
  suggestion: AiSuggestion;
  index: number;
}

export function SuggestionCard({ suggestion, index }: SuggestionCardProps) {
  const label = SUGGESTION_TYPE_LABELS[suggestion.type];
  const confidenceLabel = CONFIDENCE_LABELS[suggestion.basisConfidence];
  const confidenceColors = CONFIDENCE_COLORS[suggestion.basisConfidence];

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.1 }}
      className="bg-white rounded-xl border border-[#E8E6F0] p-5 sm:p-6 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#F3F0FF] flex items-center justify-center">
            <SparkleIcon className="w-4 h-4 text-[#7C3AED]" />
          </div>
          <h2 className="text-lg font-bold text-[#2D2B55]">{label}</h2>
        </div>
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${confidenceColors.bg} ${confidenceColors.text}`}
        >
          {confidenceLabel}
        </span>
      </div>

      <p className="text-sm text-[#6B6885] leading-relaxed mb-5">
        {suggestion.content.description}
      </p>

      {suggestion.type === "next_idea" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-[#2D2B55]">
              {suggestion.content.title}
            </span>
            <span className="font-bold text-[#7C3AED]">
              推定スコア {suggestion.content.score ?? 0}/100
            </span>
          </div>
          <div className="h-2.5 w-full bg-[#F8F7FA] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${suggestion.content.score ?? 0}%` }}
              transition={{ duration: 0.6, delay: 0.2 + index * 0.1 }}
              className="h-full rounded-full bg-[#7C3AED]"
            />
          </div>
        </div>
      )}

      {suggestion.type === "pattern_analysis" && suggestion.content.patterns && (
        <ul className="space-y-2">
          {suggestion.content.patterns.map((pattern, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[#2D2B55]">
              <CheckIcon className="w-4 h-4 text-[#22C55E] mt-0.5 shrink-0" />
              <span>{pattern}</span>
            </li>
          ))}
        </ul>
      )}

      {suggestion.type === "improvement" && suggestion.content.advice && (
        <ul className="space-y-2">
          {suggestion.content.advice.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[#2D2B55]">
              <AlertTriangleIcon className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.article>
  );
}
