"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Toast } from "@/components/ui/Toast";
import {
  CopyIcon,
  ExternalLinkIcon,
  SparkleIcon,
  InfoIcon,
  ClockIcon,
  UploadIcon,
  AlertTriangleIcon,
} from "@/components/icons";
import type { NoteArticle } from "@/lib/note-generator/types";
import type { Script } from "@/lib/video-generator/types";
import { getArticles } from "@/lib/data/note-articles";
import { getIdeas } from "@/lib/data/ideas";

interface GenerateArticleResponse {
  article: NoteArticle;
  provider: string;
  isMock: boolean;
}

interface PublishDraftResponse {
  success: boolean;
  draftUrl?: string;
  error?: string;
}

function createSampleScript(): Script {
  return {
    hook: "3秒でわかる！AIを使った動画制作の裏側",
    narration:
      "今日は、僕がTikTokのショート動画を作るときのワークフローをご紹介します。まずネタ出しから台本作成、そしてAIで画像や音声を生成して一気に仕上げていきます。特に時間がないときでも品質を落とさず投稿できるのが魅力です。",
    structure: [
      { time: "0-3秒", content: "強いフックで視聴者の興味を引く" },
      { time: "3-20秒", content: "AIツールを使った制作フローを解説" },
      { time: "20-30秒", content: "視聴者に向けたCall to Action" },
    ],
    video_prompt:
      "縦型9:16のTikTok動画。明るいオフィス風の背景で、スマホとノートパソコンが置かれた机。AIアイコンがポップアップして現れる演出。親しみやすい色使い。",
  };
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NoteArticlePage(props: PageProps<"/notes/[ideaId]">) {
  const { ideaId } = use(props.params);

  const [idea, setIdea] = useState({
    title: "AI動画制作の裏側",
    summary:
      "TikTokショート動画の企画から投稿までのワークフローを解説するネタ。AIツールを活用した効率化がポイント。",
  });

  const [article, setArticle] = useState<NoteArticle | null>(null);
  const [history, setHistory] = useState<NoteArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isPublishingDraft, setIsPublishingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getArticles(ideaId), getIdeas()])
      .then(([articles, ideas]) => {
        if (cancelled) return;
        setHistory(articles);
        setArticle(articles[0] ?? null);
        const matchedIdea = ideas.find((item) => item.id === ideaId);
        if (matchedIdea) {
          setIdea({ title: matchedIdea.title, summary: matchedIdea.description });
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("note記事の取得に失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ideaId]);

  const copyToClipboard = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast(`${label}をコピーしました`);
      } catch {
        showToast("コピーに失敗しました");
      }
    },
    [showToast]
  );

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/note/generate-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, script: createSampleScript() }),
      });

      const data = (await response.json()) as GenerateArticleResponse & { error?: string };

      if (!response.ok) {
        setError(data.error ?? "記事の生成に失敗しました。");
        return;
      }

      setArticle(data.article);
      setHistory((prev) => [data.article, ...prev]);
    } catch {
      setError("記事の生成中にネットワークエラーが発生しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublishDraft = async () => {
    if (!article) {
      return;
    }

    setIsPublishingDraft(true);
    setDraftError(null);
    setDraftUrl(null);

    try {
      const response = await fetch("/api/note/publish-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: article.title,
          body: article.body,
          hashtags: article.hashtags,
        }),
      });

      const data = (await response.json()) as PublishDraftResponse;

      if (!response.ok || !data.success) {
        setDraftError(data.error ?? "下書きの作成に失敗しました。");
        return;
      }

      setDraftUrl(data.draftUrl ?? null);
      showToast("下書きが作成されました。ブラウザで確認・公開してください。");
    } catch {
      setDraftError("下書き作成中にネットワークエラーが発生しました。");
    } finally {
      setIsPublishingDraft(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-[#E8E6F0] px-4 pl-14 sm:pl-16 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-[#2D2B55]">note記事自動生成</h1>
          <p className="text-sm text-[#6B6885] mt-1">
            ネタID: <span className="font-mono">{ideaId}</span> の台本から note 向け記事を生成します。
          </p>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl">
          {loadError && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
            </div>
          )}

          <section className="bg-white rounded-xl border border-[#E8E6F0] p-5 sm:p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#2D2B55] flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-[#7C3AED]/10 flex items-center justify-center">
                <InfoIcon className="w-4 h-4 text-[#7C3AED]" />
              </span>
              対象ネタ
            </h2>
            {isLoading ? (
              <p className="mt-4 text-sm text-[#6B6885]">読み込み中...</p>
            ) : (
              <div className="mt-4 space-y-2">
                <p className="text-base font-semibold text-[#2D2B55]">{idea.title}</p>
                <p className="text-sm text-[#6B6885] leading-relaxed">{idea.summary}</p>
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl border border-[#E8E6F0] p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[#2D2B55]">記事を生成</h2>
                <p className="text-sm text-[#6B6885] mt-1">
                  AI が台本をもとに note 向けのタイトル・本文・ハッシュタグを作成します。
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#7C3AED] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <SparkleIcon className="w-4 h-4" />
                    記事を生成
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-100 p-4 text-sm text-red-700">
                {error}
              </div>
            )}
          </section>

          {article && (
            <section className="bg-white rounded-xl border border-[#E8E6F0] p-5 sm:p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-lg font-bold text-[#2D2B55]">生成結果</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePublishDraft}
                    disabled={isPublishingDraft}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2D2B55] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1F1D40] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPublishingDraft ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        下書き作成中...
                      </>
                    ) : (
                      <>
                        <UploadIcon className="w-4 h-4" />
                        noteに下書きを作成
                      </>
                    )}
                  </button>
                  <a
                    href="https://note.com/notes/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#7C3AED] px-4 py-2 text-sm font-semibold text-[#7C3AED] hover:bg-[#7C3AED]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
                  >
                    <ExternalLinkIcon className="w-4 h-4" />
                    noteで新規投稿を開く
                  </a>
                </div>
              </div>

              <p className="flex items-start gap-1.5 text-xs text-[#6B6885] bg-[#F8F7FA] rounded-lg p-3">
                <InfoIcon className="w-4 h-4 shrink-0 mt-0.5" />
                「noteに下書きを作成」には、noteにログイン済みのChromeブラウザが必要です。公開はブラウザ上でご自身で行ってください。
              </p>

              {draftError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-4 text-sm text-red-700">
                  <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                  {draftError}
                </div>
              )}

              {draftUrl && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg bg-green-50 border border-green-100 p-4 text-sm text-green-800">
                  <span>下書きを作成しました。</span>
                  <a
                    href={draftUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-green-800 underline hover:text-green-900"
                  >
                    <ExternalLinkIcon className="w-4 h-4" />
                    下書きを開く
                  </a>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#6B6885] uppercase tracking-wider">
                  タイトル
                </label>
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-base font-bold text-[#2D2B55] bg-[#F8F7FA] rounded-lg p-3">
                    {article.title}
                  </p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(article.title, "タイトル")}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#E8E6F0] bg-white px-3 py-2 text-sm font-medium text-[#2D2B55] hover:bg-[#F8F7FA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
                    aria-label="タイトルをコピー"
                  >
                    <CopyIcon className="w-4 h-4" />
                    コピー
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#6B6885] uppercase tracking-wider">
                  本文
                </label>
                <div className="relative">
                  <textarea
                    readOnly
                    value={article.body}
                    rows={10}
                    className="w-full resize-y rounded-lg border border-[#E8E6F0] bg-[#F8F7FA] p-3 text-sm text-[#2D2B55] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(article.body, "本文")}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md border border-[#E8E6F0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#2D2B55] hover:bg-[#F8F7FA] shadow-sm transition-colors"
                  >
                    <CopyIcon className="w-3.5 h-3.5" />
                    コピー
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#6B6885] uppercase tracking-wider">
                  ハッシュタグ
                </label>
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-sm text-[#2D2B55] bg-[#F8F7FA] rounded-lg p-3">
                    {article.hashtags.join(" ")}
                  </p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(article.hashtags.join(" "), "ハッシュタグ")}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#E8E6F0] bg-white px-3 py-2 text-sm font-medium text-[#2D2B55] hover:bg-[#F8F7FA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
                    aria-label="ハッシュタグをコピー"
                  >
                    <CopyIcon className="w-4 h-4" />
                    コピー
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#6B6885] uppercase tracking-wider">
                  アイキャッチ画像生成プロンプト
                </label>
                <div className="relative">
                  <textarea
                    readOnly
                    value={article.eyeCatchPrompt}
                    rows={4}
                    className="w-full resize-y rounded-lg border border-[#E8E6F0] bg-[#F8F7FA] p-3 text-sm text-[#2D2B55] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(article.eyeCatchPrompt, "プロンプト")}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md border border-[#E8E6F0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#2D2B55] hover:bg-[#F8F7FA] shadow-sm transition-colors"
                  >
                    <CopyIcon className="w-3.5 h-3.5" />
                    コピー
                  </button>
                </div>
              </div>
            </section>
          )}

          {history.length > 0 && (
            <section className="bg-white rounded-xl border border-[#E8E6F0] p-5 sm:p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#2D2B55] flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-[#6B6885]" />
                生成履歴
              </h2>
              <ul className="mt-4 space-y-3">
                {history.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-[#E8E6F0] p-3 bg-[#F8F7FA]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#2D2B55] truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-[#6B6885]">{formatDate(item.generatedAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setArticle(item)}
                      className="shrink-0 self-start sm:self-center text-sm font-medium text-[#7C3AED] hover:text-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded"
                    >
                      表示する
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>

      <Toast message={toastMessage} />
    </div>
  );
}
