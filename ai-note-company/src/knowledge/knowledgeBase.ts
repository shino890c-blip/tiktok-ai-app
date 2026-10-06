import type { Repository } from "../database/repositories";
import type { AnalyticsResult, Article, ArticleMetrics, Idea, Strategy } from "../types";

export interface ArticleOutcome {
  article_id: string;
  topic: string;
  title: string;
  title_has_number: boolean;
  title_length: number;
  structure: string[];
  mode: Article["mode"];
  content_type: Strategy["content_type"];
  price: number;
  cta: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  sales: number | null;
  revenue: number | null;
  performance_score: number;
  success_factors: string[];
  failure_factors: string[];
  is_simulated: boolean;
}

export interface Insight {
  statement: string;
  sample_size: number;
  confidence: "low" | "medium";
}

export interface KnowledgeSummary {
  article_count: number;
  top_topics: { topic: string; performance_score: number }[];
  weak_topics: { topic: string; performance_score: number }[];
  insights: Insight[];
  recurring_success: string[];
  recurring_failure: string[];
  notes: string[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Learns from past articles. Trends are reported only when every compared
 * group has at least `minSamples` articles and the gap is meaningful — small
 * data never produces a definitive claim.
 */
export class KnowledgeBase {
  constructor(private readonly repo: Repository, private readonly minSamples = 5) {}

  recordOutcome(article: Article, strategy: Strategy, idea: Idea, analytics: AnalyticsResult, metrics: ArticleMetrics): ArticleOutcome {
    const outcome: ArticleOutcome = {
      article_id: article.article_id,
      topic: idea.topic,
      title: article.title,
      title_has_number: /[0-9０-９一二三四五六七八九十百]+(つ|個|選|分|時間|日|週|か月|ヶ月|年|冊|円|%|割|倍|ステップ)/.test(article.title) || /[0-9０-９]/.test(article.title),
      title_length: [...article.title].length,
      structure: strategy.outline.map((s) => s.heading),
      mode: article.mode,
      content_type: strategy.content_type,
      price: article.price,
      cta: strategy.cta,
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      sales: metrics.sales,
      revenue: metrics.revenue,
      performance_score: analytics.performance_score,
      success_factors: analytics.what_worked,
      failure_factors: analytics.what_failed,
      is_simulated: analytics.is_simulated,
    };
    this.repo.addKnowledge("article_outcome", article.article_id, idea.topic, outcome as unknown as Record<string, unknown>);
    return outcome;
  }

  outcomes(): ArticleOutcome[] {
    return this.repo.listKnowledge("article_outcome", 500).map((k) => k.data as unknown as ArticleOutcome);
  }

  summarize(): KnowledgeSummary {
    const outs = this.outcomes();
    const notes: string[] = [];
    const insights: Insight[] = [];
    const n = outs.length;

    if (n === 0) {
      notes.push("過去記事のデータはまだありません。傾向分析は行いません。");
    } else if (n < this.minSamples) {
      notes.push(`データ件数が少ないため（n=${n}）、傾向は断定しません。個別の結果として参考程度に扱ってください。`);
    }
    if (outs.some((o) => o.is_simulated)) notes.push("一部のデータはMOCKシミュレーション値です。実運用の判断には使わないでください。");

    // Compare two groups on a metric; only report if both are large enough.
    const compare = (label: string, a: ArticleOutcome[], b: ArticleOutcome[], aName: string, bName: string, metric: "views" | "performance_score" | "sales") => {
      const va = a.map((o) => o[metric]).filter((v): v is number => typeof v === "number");
      const vb = b.map((o) => o[metric]).filter((v): v is number => typeof v === "number");
      if (va.length < this.minSamples || vb.length < this.minSamples) return;
      const ma = avg(va);
      const mb = avg(vb);
      const hi = Math.max(ma, mb);
      const lo = Math.min(ma, mb);
      if (lo === 0 && hi === 0) return;
      const ratio = lo === 0 ? Infinity : hi / lo;
      if (ratio < 1.2) return; // gap too small to call
      const [winner, loser, mw, ml] = ma >= mb ? [aName, bName, ma, mb] : [bName, aName, mb, ma];
      insights.push({
        statement: `${label}: ${winner}の平均${metric}(${mw.toFixed(1)})が${loser}(${ml.toFixed(1)})より高い傾向（暫定）`,
        sample_size: va.length + vb.length,
        confidence: va.length + vb.length >= this.minSamples * 4 ? "medium" : "low",
      });
    };

    compare("タイトルの数字", outs.filter((o) => o.title_has_number), outs.filter((o) => !o.title_has_number), "数字あり", "数字なし", "views");
    compare("タイトルの長さ", outs.filter((o) => o.title_length <= 28), outs.filter((o) => o.title_length > 28), "28字以下", "29字以上", "views");
    compare("記事種別", outs.filter((o) => o.content_type === "paid"), outs.filter((o) => o.content_type === "free"), "有料", "無料", "performance_score");

    const byTopic = [...outs].sort((a, b) => b.performance_score - a.performance_score);
    const count = (xs: string[]) => {
      const m = new Map<string, number>();
      for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
      return [...m.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k}（${c}回）`);
    };

    return {
      article_count: n,
      top_topics: byTopic.slice(0, 3).map((o) => ({ topic: o.topic, performance_score: o.performance_score })),
      weak_topics: byTopic.length > 3 ? byTopic.slice(-3).reverse().map((o) => ({ topic: o.topic, performance_score: o.performance_score })) : [],
      insights,
      recurring_success: count(outs.flatMap((o) => o.success_factors)).slice(0, 5),
      recurring_failure: count(outs.flatMap((o) => o.failure_factors)).slice(0, 5),
      notes,
    };
  }

  /** Persists the current summary's insights so they are visible in the dashboard. */
  refreshInsights(): KnowledgeSummary {
    const s = this.summarize();
    this.repo.addKnowledge("summary", null, null, s as unknown as Record<string, unknown>);
    return s;
  }
}

export function summaryToPrompt(s: KnowledgeSummary): string {
  const lines: string[] = [`過去記事数: ${s.article_count}`];
  if (s.top_topics.length) lines.push(`伸びたテーマ: ${s.top_topics.map((t) => `${t.topic}(${t.performance_score})`).join(" / ")}`);
  if (s.weak_topics.length) lines.push(`伸びなかったテーマ: ${s.weak_topics.map((t) => `${t.topic}(${t.performance_score})`).join(" / ")}`);
  for (const i of s.insights) lines.push(`傾向[信頼度${i.confidence}, n=${i.sample_size}]: ${i.statement}`);
  if (s.recurring_success.length) lines.push(`繰り返し出た成功要因: ${s.recurring_success.join(", ")}`);
  if (s.recurring_failure.length) lines.push(`繰り返し出た失敗要因: ${s.recurring_failure.join(", ")}`);
  for (const n of s.notes) lines.push(`注意: ${n}`);
  return lines.join("\n");
}
