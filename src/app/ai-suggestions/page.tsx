"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Toast } from "@/components/ui/Toast";
import { SuggestionCard } from "@/components/ai-suggestions/SuggestionCard";
import { getSuggestions } from "@/lib/data/ai-suggestions";
import { SparkleIcon, PlusIcon, AIIcon } from "@/components/icons";
import type { AiSuggestion } from "@/components/ai-suggestions/types";

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  const datePart = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${datePart} ${timePart}`;
}

function shuffle<T>(array: T[]): T[] {
  const next = [...array];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export default function AiSuggestionsPage() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSuggestions()
      .then((data) => {
        if (!cancelled) setSuggestions(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("AI提案の取得に失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const generatedAt = useMemo(() => {
    return formatGeneratedAt(suggestions[0]?.createdAt ?? new Date().toISOString());
  }, [suggestions]);

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  }

  function handleAnalyze() {
    setIsAnalyzing(true);
    setTimeout(() => {
      setSuggestions((prev) => shuffle(prev));
      setVersion((v) => v + 1);
      setIsAnalyzing(false);
      showToast("AI分析が完了しました");
    }, 2000);
  }

  function handleAddAsIdea() {
    router.push("/ideas");
    showToast("ネタ管理画面を開きました");
  }

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-[#E8E6F0] px-4 pl-14 sm:pl-16 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <AIIcon className="w-6 h-6 text-[#7C3AED]" />
                <h1 className="text-2xl font-bold text-[#2D2B55]">AI提案</h1>
              </div>
              <p className="text-sm text-[#6B6885] mt-1">
                最終生成日時：
                <time dateTime={suggestions[0]?.createdAt}>{generatedAt}</time>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:bg-[#A78BFA] text-white text-sm font-semibold rounded-lg shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
              >
                {isAnalyzing ? (
                  <>
                    <SparkleIcon className="w-4 h-4 animate-spin" />
                    AI分析中…
                  </>
                ) : (
                  <>
                    <SparkleIcon className="w-4 h-4" />
                    AIに分析させる
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleAddAsIdea}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-[#E8E6F0] hover:border-[#7C3AED] hover:text-[#7C3AED] text-[#2D2B55] text-sm font-semibold rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                ネタとして追加
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
          {loadError && (
            <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
            </div>
          )}

          <AnimatePresence mode="wait">
            {isLoading || isAnalyzing ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center justify-center py-20"
              >
                <div className="w-12 h-12 rounded-full border-4 border-[#E8E6F0] border-t-[#7C3AED] animate-spin mb-4" />
                <p className="text-sm text-[#6B6885]">
                  {isAnalyzing ? "AIがデータを分析しています…" : "読み込み中..."}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={version}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                {suggestions.map((suggestion, index) => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    index={index}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <Toast message={toastMessage} />
    </div>
  );
}
