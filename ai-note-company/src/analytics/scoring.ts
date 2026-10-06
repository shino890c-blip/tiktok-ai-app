import type { AnalyticsResult, Article, ArticleMetrics } from "../types";

export interface Baseline {
  avg_views: number | null;
  avg_likes: number | null;
  sample_size: number;
}

/**
 * Performance score 0-100 from the metrics that were actually observed.
 * Missing metrics are excluded (and the weights renormalised), not guessed.
 */
export function scorePerformance(m: ArticleMetrics, article: Article, baseline: Baseline): { score: number; engagement: number | null; conversion: number | null } {
  const parts: { w: number; v: number }[] = [];
  if (m.views !== null) {
    const ref = baseline.avg_views && baseline.sample_size >= 3 ? baseline.avg_views : 500;
    parts.push({ w: 0.4, v: Math.min(1, m.views / (ref * 1.5)) });
  }
  const engagement = m.views && m.views > 0 && m.likes !== null ? (m.likes + (m.comments ?? 0) * 3) / m.views : null;
  if (engagement !== null) parts.push({ w: 0.3, v: Math.min(1, engagement / 0.1) });
  if (m.comments !== null) parts.push({ w: 0.1, v: Math.min(1, m.comments / 10) });
  const paid = article.mode === "PAID" || article.mode === "PARTIAL_PAID";
  const conversion = paid && m.views && m.views > 0 && m.sales !== null ? m.sales / m.views : null;
  if (paid && conversion !== null) parts.push({ w: 0.2, v: Math.min(1, conversion / 0.03) });
  const wsum = parts.reduce((s, p) => s + p.w, 0);
  const score = wsum ? Math.round((parts.reduce((s, p) => s + p.w * p.v, 0) / wsum) * 100) : 0;
  return { score, engagement, conversion };
}

/** Explainable rule-based findings; the LLM (if real) may refine them. */
export function ruleBasedReview(m: ArticleMetrics, article: Article, baseline: Baseline, engagement: number | null, conversion: number | null): Pick<AnalyticsResult, "what_worked" | "what_failed" | "next_actions"> {
  const worked: string[] = [];
  const failed: string[] = [];
  const next: string[] = [];
  const missing = (["views", "likes", "comments", "sales"] as const).filter((k) => m[k] === null);
  if (missing.length) next.push(`取得できなかった指標（${missing.join(", ")}）は評価対象外。手動で確認して feedback に記録する`);

  if (m.views !== null && baseline.avg_views && baseline.sample_size >= 3) {
    if (m.views >= baseline.avg_views * 1.3) worked.push("タイトル/テーマ: 閲覧数が過去平均を大きく上回った");
    else if (m.views <= baseline.avg_views * 0.7) {
      failed.push("タイトル/テーマ: 閲覧数が過去平均を下回った");
      next.push("次回は読者の悩みをタイトル前半に置き、得られる結果を具体的に書く");
    }
  } else if (m.views !== null) {
    next.push("比較できる過去データが少ないため、閲覧数の良し悪しは判定しない");
  }
  if (engagement !== null) {
    if (engagement >= 0.05) worked.push("導入・本文: スキ/コメント率が高く、読了後の満足度が高いと推測される");
    else if (engagement < 0.02) {
      failed.push("導入・本文: スキ率が低い");
      next.push("導入で読者の状況を具体的に描写し、早い段階で結論の方向性を示す");
    }
  }
  if (m.comments !== null && m.comments === 0) next.push("CTAを『質問への回答をコメントで』など答えやすい形にする");
  if (article.mode === "PAID" || article.mode === "PARTIAL_PAID") {
    if (conversion !== null) {
      if (conversion >= 0.02) worked.push(`有料部分への遷移: 購入率${(conversion * 100).toFixed(1)}%（価格${article.price}円）`);
      else if (m.views !== null && m.views >= 100) {
        failed.push(`有料部分への遷移: 購入率${(conversion * 100).toFixed(2)}%と低い`);
        next.push("無料部分で判断材料を増やし、有料部分の中身（手順/テンプレート）を具体的に予告する。価格を下げる前に無料部分を見直す");
      }
    }
  }
  if (!worked.length && !failed.length) next.push("明確な傾向は出ていない。同条件の記事を増やしてから判断する");
  return { what_worked: worked, what_failed: failed, next_actions: next };
}
