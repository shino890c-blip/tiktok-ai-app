import type { ArticleMode } from "../config";
import type { KnowledgeSummary } from "../knowledge/knowledgeBase";
import { summaryToPrompt } from "../knowledge/knowledgeBase";
import type { AnalyticsResult, ArticleMetrics, Idea, QualityIssue, Strategy } from "../types";
import { PAID_MARKER } from "../agents/writer/articleFormat";

export interface TrendSignal {
  source: string; // e.g. google_trends, news, youtube, note, x_manual, own_articles, mock
  title: string;
  url?: string;
  summary?: string;
  metric?: string;
}

export interface ResearchContext {
  signals: TrendSignal[];
  knowledge: KnowledgeSummary;
  recentTopics: string[];
  count: number;
  today: string;
}
export interface StrategyContext {
  idea: Idea;
  knowledge: KnowledgeSummary;
  defaultMode: ArticleMode;
  defaultPrice: number;
}
export interface WritingContext {
  strategy: Strategy;
  idea: Idea;
}
export interface RevisionContext extends WritingContext {
  previousMarkdown: string;
  issues: QualityIssue[];
  humanComment?: string;
}
export interface QualityReviewContext {
  markdown: string;
  mode: ArticleMode;
  price: number;
}
export interface AnalyticsReviewContext {
  title: string;
  topic: string;
  mode: ArticleMode;
  price: number;
  metrics: ArticleMetrics;
  baseline: { avg_views: number | null; avg_likes: number | null; sample_size: number };
  rule_based: Pick<AnalyticsResult, "what_worked" | "what_failed" | "next_actions">;
}

const COMMON_RULES = `
- 日本語で出力する。
- 他人の記事・文章をコピーしない。参照情報は「なぜ読まれるか」の分析にだけ使う。
- 根拠のない断定、誇大表現（必ず儲かる・100%など）、医療/投資の断定的助言をしない。
- 取得できていない数値を推測で作らない。`.trim();

export function researchPrompt(ctx: ResearchContext): { system: string; prompt: string } {
  return {
    system: `あなたはnote（note.com）の編集リサーチャーです。今後伸びる可能性があるテーマを分析します。\n${COMMON_RULES}`,
    prompt: `今日: ${ctx.today}
以下のトレンドシグナルと過去実績から、note記事のテーマ案を${ctx.count}件提案してください。
各案について「なぜこのテーマが読まれる可能性があるのか」を trend_reason に具体的に書いてください。
直近に扱ったテーマ（重複禁止）: ${ctx.recentTopics.join(" / ") || "なし"}

## トレンドシグナル
${ctx.signals.map((s, i) => `${i + 1}. [${s.source}] ${s.title}${s.metric ? ` (${s.metric})` : ""}${s.url ? ` ${s.url}` : ""}${s.summary ? `\n   ${s.summary}` : ""}`).join("\n") || "（取得できたシグナルなし。一般的な読者の悩みから考える）"}

## 過去実績（Knowledge Base）
${summaryToPrompt(ctx.knowledge)}

## 出力（JSONのみ）
{"ideas":[{"topic":"","target_reader":"","reader_problem":"","trend_reason":"","unique_angle":"","title_candidates":["","",""],"monetization_potential":0-100,"confidence":0-100,"sources":["参照したシグナルのURLまたはsource名"]}]}`,
  };
}

export function strategyPrompt(ctx: StrategyContext): { system: string; prompt: string } {
  return {
    system: `あなたはnoteのコンテンツストラテジストです。リサーチ結果を、記事として成立する企画に変換します。\n${COMMON_RULES}
- 有料記事の場合、無料部分だけでも読者が価値を得られる構成にする。有料部分を水増ししない。`,
    prompt: `## リサーチ結果
${JSON.stringify(ctx.idea, null, 2)}

## 過去実績
${summaryToPrompt(ctx.knowledge)}

## 条件
- 既定の記事モード: ${ctx.defaultMode}（FREE/PAID/PARTIAL_PAID/DRAFT）。テーマに合わない場合は理由を purpose に書いて変更してよい。
- 有料の場合の既定価格: ${ctx.defaultPrice}円（価格に見合う具体的な価値がある場合のみ有料にする）
- outline は4〜7セクション。各セクションに paid(true/false) を付ける。無料記事なら全て false。

## 出力（JSONのみ）
{"content_type":"free|paid","article_mode":"FREE|PAID|PARTIAL_PAID|DRAFT","title":"","subtitle":"","purpose":"","target_reader":"","outline":[{"heading":"","points":[""],"paid":false}],"free_value":"","paid_value":"","price":0,"cta":"","reader_takeaway":""}`,
  };
}

const WRITING_FORMAT = `
出力フォーマット（Markdownのみ。前置き不要）:
---
title: 記事タイトル
description: 120字以内の説明（SEO用）
tags: タグ1, タグ2, タグ3, タグ4, タグ5
slug: english-slug
---
# 記事タイトル

導入（読者の状況に寄り添う）→ 問題提起 → 本編（## 見出し）→ 具体例 → 結論 → CTA

有料記事の場合のみ、無料部分の最後に「ここから先では〜」と有料部分の中身を自然に予告し、その直後の行に
${PAID_MARKER}
を1回だけ置き、その後に有料部分を書く。`.trim();

const STYLE_RULES = `
- 完全オリジナルの文章。AI臭い定型句（「いかがでしたか」「〜と言えるでしょう」の多用、「重要です」の連発など）を避ける。
- 同じ言い回しを繰り返さない。文末表現に変化をつける。
- 無意味な箇条書きを大量に使わない。基本は段落で語る。
- 具体例・場面描写を入れ、読者が最後まで読みたくなる流れにする。
- 年や統計など古くなりうる情報は、出典か「執筆時点」を明記するか、書かない。`.trim();

export function writingPrompt(ctx: WritingContext): { system: string; prompt: string } {
  return {
    system: `あなたはnoteで読まれる記事を書くプロのライター兼編集者です。\n${COMMON_RULES}\n${STYLE_RULES}`,
    prompt: `## 企画
${JSON.stringify(ctx.strategy, null, 2)}

## リサーチ
読者の悩み: ${ctx.idea.reader_problem}
独自の切り口: ${ctx.idea.unique_angle}

${WRITING_FORMAT}`,
  };
}

export function revisionPrompt(ctx: RevisionContext): { system: string; prompt: string } {
  return {
    system: `あなたはnote記事の編集者です。品質チェックの指摘を反映して記事を書き直します。\n${COMMON_RULES}\n${STYLE_RULES}`,
    prompt: `## 指摘事項
${ctx.issues.map((i) => `- [${i.severity}] ${i.check}: ${i.message}`).join("\n")}
${ctx.humanComment ? `\n## 人間からのコメント\n${ctx.humanComment}\n` : ""}
## 企画
${JSON.stringify(ctx.strategy, null, 2)}

## 現在の記事
${ctx.previousMarkdown}

${WRITING_FORMAT}`,
  };
}

export function qualityReviewPrompt(ctx: QualityReviewContext): { system: string; prompt: string } {
  return {
    system: `あなたは厳格なnote編集長です。公開前の記事を検査します。点数を甘くしないでください。`,
    prompt: `記事モード: ${ctx.mode} / 価格: ${ctx.price}円
次の観点で問題点だけを挙げてください: 誤字, 日本語の不自然さ, 重複, AI臭, 根拠のない断定, 古い情報, 読者価値, タイトル, 導入, CTA, 有料部分の価値（価格に見合うか）, コピーの疑い, 著作権, 不適切な内容。

## 記事
${ctx.markdown}

## 出力（JSONのみ）
{"score":0-100,"issues":[{"check":"観点名","severity":"minor|major|critical","message":"具体的な指摘"}]}`,
  };
}

export function analyticsReviewPrompt(ctx: AnalyticsReviewContext): { system: string; prompt: string } {
  return {
    system: `あなたはnoteのデータアナリストです。取得できた数値だけを根拠に評価します。null は「取得できなかった」の意味で、推測で埋めないでください。`,
    prompt: `${JSON.stringify(ctx, null, 2)}

タイトル・導入・構成・有料部分への遷移・CTA・価格・読者反応の観点で評価してください。
## 出力（JSONのみ）
{"what_worked":[""],"what_failed":[""],"next_actions":[""]}`,
  };
}
