import { createHash } from "node:crypto";
import type { AnalysisOutput, QCReview, ResearchOutput, ScriptOutput } from "../../agents/schemas.js";
import type { LLMProvider, LLMRequest, LLMResponse } from "../types.js";

/**
 * Deterministic offline LLM used in MOCK_MODE and tests. It produces schema-valid,
 * plausible outputs derived from the request context so the whole pipeline can run
 * without any API key. Its content is clearly sample content, not real research.
 */

interface TopicSeed {
  topic: string;
  hookQuestion: string;
  hookConclusion: string;
  audience: string;
  pain: string;
  points: string[];
  payoff: string;
}

const TOPICS: TopicSeed[] = [
  {
    topic: "冷凍ご飯をふっくら保つコツ",
    hookQuestion: "冷凍ご飯がパサつくの、冷凍する『タイミング』のせいって知ってました？",
    hookConclusion: "冷凍ご飯は『炊きたての温かいうち』に包むのが正解です。",
    audience: "自炊をしている一人暮らしの社会人・学生",
    pain: "まとめ炊きしたご飯がおいしくない",
    points: ["冷めると水分が逃げる", "温かいうちに薄く平らに包む", "粗熱が取れてから冷凍庫へ"],
    payoff: "温かいうちに包むだけで、解凍後の食感が変わりやすくなります",
  },
  {
    topic: "部屋干しの生乾き臭を防ぐ考え方",
    hookQuestion: "部屋干しが臭う原因、洗剤じゃないかもしれません。",
    hookConclusion: "部屋干しの臭い対策は『早く乾かす』がいちばん大事です。",
    audience: "梅雨や冬に部屋干しが多い家庭",
    pain: "部屋干しした洗濯物が臭う",
    points: ["乾くまでの時間が長いと菌が増えやすい", "洗濯物の間隔をこぶし1つ分あける", "扇風機やサーキュレーターで風を当てる"],
    payoff: "『乾く時間を短くする』を意識するだけで対策しやすくなります",
  },
  {
    topic: "玉ねぎで涙が出にくくなる切り方",
    hookQuestion: "玉ねぎで泣いてしまう人、包丁を見直したことありますか？",
    hookConclusion: "玉ねぎの涙対策は『よく切れる包丁』と『冷やす』の2つです。",
    audience: "料理初心者",
    pain: "玉ねぎを切るたびに目が痛い",
    points: ["切ると目にしみる成分が出る", "よく切れる包丁だと細胞が潰れにくい", "冷蔵庫で冷やすと揮発しにくい"],
    payoff: "道具と温度を変えるだけで、ぐっと楽になります",
  },
  {
    topic: "集中が続かないときの時間の区切り方",
    hookQuestion: "勉強が30分も続かないのは、意志が弱いからだと思っていませんか？",
    hookConclusion: "集中力は『短く区切って休む』ほうが続きやすいです。",
    audience: "勉強や在宅ワークで集中できない人",
    pain: "作業に集中できずダラダラしてしまう",
    points: ["人の集中には波がある", "25分作業＋5分休憩などで区切る", "休憩中はスマホを見ない"],
    payoff: "区切り方を変えるだけで、作業のハードルが下がります",
  },
  {
    topic: "雨の日に体調を崩しやすい人の過ごし方",
    hookQuestion: "雨の日になると頭が重い…それ、気のせいじゃないかもしれません。",
    hookConclusion: "天気で体調が変わる人は『気圧の変化』を意識すると対策しやすいです。",
    audience: "天気で体調が変わりやすい人",
    pain: "雨の日にだるさや頭の重さを感じる",
    points: ["気圧の変化に体が反応する人がいる", "天気予報で気圧の変化を確認できる", "睡眠と水分をいつもより意識する"],
    payoff: "前もって分かれば、予定の立て方を工夫できます（つらい時は医療機関へ）",
  },
];

function hashNum(input: string): number {
  return parseInt(createHash("sha256").update(input).digest("hex").slice(0, 8), 16);
}

function pickTopics(seed: string, avoid: string[], n: number): TopicSeed[] {
  const start = hashNum(seed) % TOPICS.length;
  const ordered = [...TOPICS.slice(start), ...TOPICS.slice(0, start)];
  const fresh = ordered.filter((t) => !avoid.includes(t.topic));
  return (fresh.length >= n ? fresh : ordered).slice(0, n);
}

type Ctx = Record<string, unknown>;

function research(ctx: Ctx): ResearchOutput {
  const trending = (ctx.trending as { title: string; url: string; durationSec: number; viewsPerHour: number }[]) ?? [];
  const recentTopics = (ctx.recentTopics as string[]) ?? [];
  const negativeThemes = (ctx.negativeThemes as string[]) ?? [];
  const experiment = ctx.experiment as { variant?: string } | null;
  const avgDuration = trending.length
    ? Math.round(trending.reduce((s, v) => s + v.durationSec, 0) / trending.length)
    : 30;
  const seeds = pickTopics(String(ctx.seed ?? "seed"), [...recentTopics, ...negativeThemes], 3);
  const urls = trending.slice(0, 3).map((v) => v.url);
  const variant = experiment?.variant ?? "";
  const duration = variant.includes("20") ? 20 : variant.includes("35") ? 35 : Math.min(45, Math.max(20, avgDuration));
  return {
    market_summary: `「${String(ctx.niche)}」ジャンルでは、日常の小さな悩みを短時間で解決するShortsが伸びている（サンプル数 ${trending.length}、平均尺 ${avgDuration}秒）。冒頭で『意外な原因』を提示する構成が多い。`,
    audience_pains: seeds.map((s) => s.pain),
    trend_patterns: [
      {
        pattern: "冒頭で常識を軽く否定する",
        evidence: trending[0] ? `上位動画「${trending[0].title}」など` : "上位動画の傾向",
        why_it_works: "視聴者に『え、そうなの？』という違和感を作り、続きを見る理由になる",
      },
      {
        pattern: "結論→理由→手順の3段構成",
        evidence: "コメントで『分かりやすい』『保存した』という反応が多い",
        why_it_works: "短尺でも満足感が出て保存・共有されやすい",
      },
    ],
    ideas: seeds.map((s, i) => ({
      topic: s.topic,
      hook: variant.includes("結論") ? s.hookConclusion : s.hookQuestion,
      trend_reason: "日常の悩み×意外な原因の組み合わせが、短尺で高い視聴維持を得ている",
      why_worth_making: `${s.audience}が日常的に抱える「${s.pain}」を、根拠のある一般的な対策で解決できる。競合は原因の説明が浅く、理由まで示すことで差別化できる。`,
      target_audience: s.audience,
      recommended_duration: duration,
      structure: ["hook", "problem", "development", "payoff", "cta"],
      confidence_score: Number((0.82 - i * 0.07).toFixed(2)),
      source_urls: urls,
      originality_note: "他チャンネルの台本・映像は使わず、『伸びている理由（構成パターン）』のみを抽象化して自社の切り口で再構成",
    })),
  };
}

function script(ctx: Ctx): ScriptOutput {
  const idea = ctx.idea as { topic: string; hook: string; recommended_duration: number; target_audience: string };
  const seed = TOPICS.find((t) => t.topic === idea.topic);
  const points = seed?.points ?? ["ポイント1", "ポイント2", "ポイント3"];
  const payoff = seed?.payoff ?? "今日から試せます";
  const maxDuration = Number(ctx.maxDuration ?? 60);
  const total = Math.min(maxDuration, Math.max(15, idea.recommended_duration));
  const hookEnd = 3;
  const closingLen = 7;
  const bodyLen = (total - hookEnd - closingLen) / (points.length + 1);
  const scenes: ScriptOutput["scenes"] = [];
  let t = hookEnd;
  scenes.push({
    scene_no: 1,
    start_sec: 0,
    end_sec: hookEnd,
    narration: idea.hook,
    telop: idea.hook.length > 22 ? idea.hook.slice(0, 20) + "…" : idea.hook,
    visual: "結果のビフォー映像をアップで。視線を引く動き",
    sfx: "ポン（注目音）",
    bgm: "テンポの速いポップ系、小さめ",
  });
  scenes.push({
    scene_no: 2,
    start_sec: t,
    end_sec: round(t + bodyLen),
    narration: "実は、原因はここです。",
    telop: "原因はここ",
    visual: "悩んでいる手元のカット",
    sfx: "",
    bgm: "継続",
  });
  t = round(t + bodyLen);
  points.forEach((p, i) => {
    scenes.push({
      scene_no: scenes.length + 1,
      start_sec: t,
      end_sec: round(t + bodyLen),
      narration: `${i + 1}つ目、${p}。`,
      telop: `${i + 1}. ${p.length > 16 ? p.slice(0, 15) + "…" : p}`,
      visual: `ポイント${i + 1}の手順を実演`,
      sfx: "シュッ（切替音）",
      bgm: "継続",
    });
    t = round(t + bodyLen);
  });
  scenes.push({
    scene_no: scenes.length + 1,
    start_sec: t,
    end_sec: total,
    narration: `${payoff}。役に立ったら保存して、ほかの暮らしの小ワザもチェックしてください。`,
    telop: "保存して試してみてね",
    visual: "アフターの映像と保存ボタンを指差すジェスチャー",
    sfx: "キラーン",
    bgm: "サビで締める",
  });
  return {
    title_candidates: [
      `${idea.topic}｜知らないと損する理由`,
      `【暮らしの科学】${idea.topic}`,
      `${seed?.pain ?? idea.topic}を解決する3つのポイント`,
    ],
    hook: {
      time_range: "0-2s",
      narration: idea.hook,
      telop: scenes[0]!.telop,
      visual: scenes[0]!.visual,
      intent: "常識とのギャップで『え、何それ？』を作る",
    },
    scenes,
    cta: "保存して試してみてね／ほかの暮らしの小ワザもチェック",
    estimated_duration_sec: total,
    retention_points: [
      { time_sec: 2, technique: "原因を予告して答えを後回しにする" },
      { time_sec: Math.round(total / 2), technique: "番号付きで残りのポイント数を意識させる" },
      { time_sec: total - 3, technique: "ビフォーアフターで回収" },
    ],
    description: `${idea.topic}をサクッと解説。${idea.target_audience}向けの暮らしの小ワザです。\n※一般的な情報です。体調に関わる内容は専門家にご相談ください。`,
    hashtags: ["#Shorts", "#暮らしの知恵", "#ライフハック"],
    bgm_direction: "著作権フリー（YouTubeオーディオライブラリ等）のポップ系BGM",
    fact_check_notes: [`「${points[0]}」の一般的な根拠を公開前に確認する`],
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function qualityReview(ctx: Ctx): QCReview {
  const s = ctx.script as ScriptOutput;
  const issues: QCReview["issues"] = [];
  if (s.hook.narration.length > 45) {
    issues.push({
      severity: "minor",
      field: "hook",
      message: "冒頭ナレーションが長く、2秒で読み切れない可能性",
      suggestion: "30文字以内に短縮",
    });
  }
  return {
    issues,
    overall_score: issues.length ? 78 : 88,
    summary: issues.length ? "軽微な改善点あり。公開可能な水準。" : "構成・表現ともに問題なし。",
  };
}

function analysis(ctx: Ctx): AnalysisOutput {
  const score = Number(ctx.performanceScore ?? 50);
  const avg = ctx.channelAverageScore as number | null;
  const retention = (ctx.retention as { ratio: number; watchRatio: number }[] | null) ?? null;
  const duration = Number(ctx.durationSec ?? 30);
  const hookStyle = String(ctx.hookStyle ?? "unknown");
  const experiment = ctx.experiment as { name: string } | null;
  const success = score >= 60;
  const dropPoint = retention?.find((p) => p.watchRatio < 0.6);
  const retentionNotes = retention
    ? [
        `冒頭2秒の維持率: ${Math.round((retention[1]?.watchRatio ?? retention[0]?.watchRatio ?? 0) * 100)}%`,
        dropPoint
          ? `動画の${Math.round(dropPoint.ratio * 100)}%地点で維持率が60%を下回った`
          : "大きな離脱ポイントは見られない",
      ]
    : ["視聴維持データは取得できなかったため分析対象外"];
  return {
    success,
    verdict_reason: success
      ? `パフォーマンススコア${score}はチャンネル基準(60)を上回った`
      : `パフォーマンススコア${score}が基準(60)を下回った`,
    what_worked: success ? ["冒頭で悩みを具体化できた", "番号付き構成で最後まで見る理由を作れた"] : ["テーマ自体への反応はあった"],
    what_failed: success ? [] : ["冒頭2秒で視聴を止める力が弱い", "中盤の説明が長い"],
    hook_assessment: `フック形式「${hookStyle}」: ${success ? "機能した" : "改善の余地あり"}`,
    duration_assessment: `${duration}秒。${duration > 40 && !success ? "長すぎた可能性" : "概ね適切"}`,
    retention_analysis: retentionNotes,
    title_assessment: "インプレッション/CTRはAPIで取得できないため、タイトル評価は再生数と維持率からの間接評価に留める",
    theme_strength: score >= 75 ? "strong" : score >= 50 ? "medium" : "weak",
    comparison_to_past:
      avg === null ? "過去データなし（初回）" : `過去平均スコア${avg}に対して${score >= avg ? "上回った" : "下回った"}`,
    recommended_changes: success
      ? ["同じフック形式を別テーマで再検証する", "CTAを保存誘導に統一する"]
      : ["冒頭を結論提示型に変えて比較する", "尺を25秒以内に短縮する"],
    next_experiments: success ? ["同テーマの深掘り続編"] : ["冒頭で結論を提示する", "20秒以内にまとめる"],
    growth_hypothesis: success
      ? "『日常の悩み×意外な原因』の型は再現性がある"
      : "冒頭の違和感が弱いと、テーマが良くても初動が伸びない",
    experiment_verdict: experiment ? (success ? "success" : "failure") : null,
  };
}

export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  readonly calls: LLMRequest[] = [];
  constructor(readonly model = "mock-model") {}

  async complete(req: LLMRequest): Promise<LLMResponse> {
    this.calls.push(req);
    let out: unknown;
    switch (req.purpose) {
      case "research":
        out = research(req.context);
        break;
      case "script":
        out = script(req.context);
        break;
      case "quality_review":
        out = qualityReview(req.context);
        break;
      case "analysis":
        out = analysis(req.context);
        break;
    }
    return { text: JSON.stringify(out), provider: this.name, model: this.model };
  }
}
