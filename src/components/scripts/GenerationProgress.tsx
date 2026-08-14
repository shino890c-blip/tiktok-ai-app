"use client";

import { CheckCircleIcon, XCircleIcon, ClockIcon } from "@/components/icons";
import type { GenerationStep } from "./types";

interface GenerationProgressProps {
  steps: GenerationStep[];
}

/** 生成進捗表示：ステップ1/3, 2/3, 3/3 とステータスの表示 */
export function GenerationProgress({ steps }: GenerationProgressProps) {
  const total = steps.length;

  return (
    <div className="space-y-3" role="status" aria-live="polite">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              step.status === "success"
                ? "bg-[#DCFCE7] text-[#22C55E]"
                : step.status === "error"
                  ? "bg-[#FEE2E2] text-[#EF4444]"
                  : step.status === "in_progress"
                    ? "bg-[#F3F0FF] text-[#7C3AED]"
                    : "bg-[#F8F7FA] text-[#A8A5BD]"
            }`}
          >
            {step.status === "success" ? (
              <CheckCircleIcon className="w-4 h-4" />
            ) : step.status === "error" ? (
              <XCircleIcon className="w-4 h-4" />
            ) : step.status === "in_progress" ? (
              <ClockIcon className="w-4 h-4 animate-spin" />
            ) : (
              index + 1
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-[#2D2B55]">
                ステップ {index + 1}/{total}
              </span>
              <span className="text-[#6B6885]">{step.label}</span>
            </div>
            {step.message && (
              <p className={`text-xs mt-0.5 ${step.status === "error" ? "text-[#EF4444]" : "text-[#6B6885]"}`}>
                {step.message}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
