import type {
  AnalyticsReviewContext,
  QualityReviewContext,
  ResearchContext,
  RevisionContext,
  StrategyContext,
  WritingContext,
} from "../prompts";
import { PAID_MARKER } from "../agents/writer/articleFormat";
import { seeded } from "../utils";
import { findTheme, MOCK_THEMES, type MockTheme } from "./mockThemes";
import type { LlmProvider, LlmRequest } from "./provider";

/**
 * Deterministic offline LLM used in MOCK mode and tests. It reads the
 * structured `context` of each request and returns output in exactly the same
 * format a real model is asked for, so the downstream parsers are exercised.
 */
export class MockLlm implements LlmProvider {
  readonly name = "mock";
  readonly isMock = true;
  calls: { task: string }[] = [];

  async generateText(req: LlmRequest): Promise<string> {
    this.calls.push({ task: req.task });
    switch (req.task) {
      case "research":
        return JSON.stringify(this.research(req.context as ResearchContext));
      case "strategy":
        return JSON.stringify(this.strategy(req.context as StrategyContext));
      case "writing":
        return this.write(req.context as WritingContext);
      case "revision":
        return this.write(req.context as RevisionContext);
      case "quality_review":
        return JSON.stringify(this.review(req.context as QualityReviewContext));
      case "analytics_review":
        return JSON.stringify((req.context as AnalyticsReviewContext).rule_based);
      default:
        throw new Error(`MockLlm: unknown task ${req.task}`);
    }
  }

  private research(ctx: ResearchContext) {
    const recent = new Set(ctx.recentTopics);
    const ranked = [...MOCK_THEMES]
      .filter((t) => !recent.has(t.topic))
      .sort((a, b) => seeded(ctx.today + b.key) - seeded(ctx.today + a.key));
    const pool = ranked.length ? ranked : [...MOCK_THEMES];
    const boost = new Set(ctx.knowledge.top_topics.map((t) => t.topic));
    return {
      ideas: pool.slice(0, ctx.count).map((t) => {
        const related = ctx.signals.filter((s) => t.keywords.some((k) => s.title.includes(k) || (s.summary ?? "").includes(k)));
        const reason = related.length
          ? `関連シグナル「${related.slice(0, 2).map((s) => s.title).join("」「")}」が観測されており、${t.target_reader}の関心が高まっている可能性がある。`
          : `${t.keywords.join("・")}は継続的に悩みが語られるテーマで、季節を問わず検索される。具体的な手順を示す記事が少ないため差別化しやすい。`;
        return {
          topic: t.topic,
          target_reader: t.target_reader,
          reader_problem: t.reader_problem,
          trend_reason: reason + (boost.has(t.topic) ? "（過去に伸びたテーマ）" : ""),
          unique_angle: t.unique_angle,
          title_candidates: t.titles,
          monetization_potential: t.monetization,
          confidence: Math.round(45 + seeded(t.key) * 30),
          sources: related.length ? related.map((s) => s.url ?? s.source) : ["mock:theme-bank"],
        };
      }),
    };
  }

  private strategy(ctx: StrategyContext) {
    const t = this.themeFor(ctx.idea.topic);
    const mode = ctx.defaultMode;
    const paid = mode === "PAID" || mode === "PARTIAL_PAID";
    const outline = [
      ...t.sections.map((s) => ({ heading: s.heading, points: s.points, paid: false })),
      ...t.paidSections.map((s) => ({ heading: s.heading, points: s.points, paid: paid })),
    ];
    return {
      content_type: paid ? "paid" : "free",
      article_mode: mode,
      title: ctx.idea.title_candidates[0] ?? t.titles[0],
      subtitle: t.unique_angle,
      purpose: `${t.target_reader}が、${t.reader_problem.replace(/。$/, "")}という状態から抜け出す最初の一歩を踏み出せるようにする`,
      target_reader: t.target_reader,
      outline,
      free_value: `問題の原因と、解決の方向性（${t.sections.map((s) => s.heading).join("／")}）が無料部分だけで分かる`,
      paid_value: paid ? `実行のための具体的な手順（${t.paidSections.map((s) => s.heading).join("／")}）` : "",
      price: paid ? ctx.defaultPrice : 0,
      cta: "試してみた結果や、うまくいかなかった点をコメントで教えてください。次の記事で取り上げます。",
      reader_takeaway: "今日中に1つだけ行動を変えられる状態になっている",
    };
  }

  private write(ctx: WritingContext | RevisionContext): string {
    const s = ctx.strategy;
    const t = findTheme(ctx.idea.topic);
    const examples = new Map<string, string>();
    for (const sec of [...(t?.sections ?? []), ...(t?.paidSections ?? [])]) examples.set(sec.heading, sec.example);

    const connectors = ["また、", "そのうえで、", "加えて、", "さらに言えば、"];
    const exampleLeads = ["少し具体的に想像してみてください。", "ひとつ例を挙げます。", "身近な場面で確認しておきます。", "実際の場面に置き換えてみます。"];
    let c = 0;
    let e = 0;
    const section = (heading: string, points: string[]) => {
      const sentences = points.map((p, i) => (i === 0 || /^(その|なお|また|さらに|反対に|逆に|方向性|最初|次|最後)/.test(p) ? p : connectors[c++ % connectors.length] + p) + "。");
      const para1 = sentences.slice(0, 2).join("");
      const para2 = sentences.slice(2).join("");
      const ex = examples.get(heading);
      return [`## ${heading}`, para1, para2, ex ? `${exampleLeads[e++ % exampleLeads.length]}${ex}` : ""].filter(Boolean).join("\n\n");
    };

    const free = s.outline.filter((o) => !o.paid);
    const paid = s.outline.filter((o) => o.paid);
    const isPaid = paid.length > 0;

    const intro = [
      `# ${s.title}`,
      `「${ctx.idea.reader_problem.replace(/。$/, "")}」。${s.target_reader}なら、一度はそう感じたことがあるかもしれません。`,
      `この記事では、${ctx.idea.unique_angle.replace(/。$/, "")}という視点から、無理なく続けられるやり方を整理していきます。読み終えるころには、${s.reader_takeaway.replace(/。$/, "")}はずです。`,
    ].join("\n\n");

    const parts: string[] = [intro, ...free.map((o) => section(o.heading, o.points))];
    if (isPaid) {
      parts.push(
        `## ここまでのまとめ\n\nここまでで、つまずきの原因と、どの方向に手を打てばよいかは見えてきたと思います。考え方だけでも、明日からの動き方は変えられます。`,
        `ここから先では、${paid.map((p) => `「${p.heading}」`).join("と")}について、実際に手を動かすための手順を順番に解説します。${s.paid_value ? `${s.paid_value.replace(/。$/, "")}をまとめているので、` : ""}すぐに試したい方は続きをどうぞ。`,
        PAID_MARKER,
        ...paid.map((o) => section(o.heading, o.points)),
      );
    }
    parts.push(
      `## おわりに\n\n大きく変えようとすると、たいてい続きません。まずは今日、この記事の中から1つだけ選んで試してみてください。小さな変化を確かめながら進めるほうが、結果的に遠くまで行けます。`,
      s.cta,
    );
    if ("humanComment" in ctx && ctx.humanComment) parts.push(`（編集メモ反映: ${ctx.humanComment}）`);

    const tags = t?.tags ?? ["note", "暮らし", "仕事術"];
    const fm = [
      "---",
      `title: ${s.title}`,
      `description: ${ctx.idea.reader_problem.replace(/。$/, "")}。${s.subtitle}`.slice(0, 120),
      `tags: ${tags.join(", ")}`,
      `slug: ${t?.key ?? "article"}`,
      "---",
    ].join("\n");
    return `${fm}\n${parts.join("\n\n")}\n`;
  }

  private review(_ctx: QualityReviewContext) {
    return { score: 90, issues: [] };
  }

  private themeFor(topic: string): MockTheme {
    return findTheme(topic) ?? MOCK_THEMES[Math.floor(seeded(topic) * MOCK_THEMES.length)];
  }
}
