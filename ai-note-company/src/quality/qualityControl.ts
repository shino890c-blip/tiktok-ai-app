import { PAID_MARKER } from "../agents/writer/articleFormat";
import { generateJson, type LlmProvider } from "../llm/provider";
import { qualityReviewPrompt } from "../prompts";
import type { Article, QualityIssue, QualityReport } from "../types";

export interface QualityOptions {
  threshold: number;
  /** Other texts the article must not copy (past articles, research snippets). */
  references?: { id: string; text: string }[];
  now?: Date;
  llm?: LlmProvider;
}

const AI_SMELL: { phrase: RegExp; label: string; allow: number; penalty: number }[] = [
  { phrase: /いかがでしたで?し?ょ?う?か/g, label: "いかがでしたか", allow: 0, penalty: 5 },
  { phrase: /と言えるでしょう/g, label: "と言えるでしょう", allow: 1, penalty: 2 },
  { phrase: /ではないでしょうか/g, label: "ではないでしょうか", allow: 2, penalty: 2 },
  { phrase: /重要です/g, label: "重要です", allow: 2, penalty: 2 },
  { phrase: /必要不可欠/g, label: "必要不可欠", allow: 0, penalty: 2 },
  { phrase: /(様々|さまざま)な/g, label: "さまざまな", allow: 2, penalty: 1 },
  { phrase: /結論から(言う|いう)と/g, label: "結論から言うと", allow: 1, penalty: 2 },
  { phrase: /ぜひ参考にしてください/g, label: "ぜひ参考にしてください", allow: 0, penalty: 3 },
  { phrase: /非常に/g, label: "非常に", allow: 2, penalty: 1 },
  { phrase: /徹底解説|完全網羅|網羅的に/g, label: "徹底解説/網羅", allow: 0, penalty: 2 },
  { phrase: /について解説します/g, label: "について解説します", allow: 1, penalty: 2 },
  { phrase: /を見ていきましょう/g, label: "を見ていきましょう", allow: 1, penalty: 2 },
  { phrase: /ことが(大切|重要)です/g, label: "ことが大切/重要です", allow: 2, penalty: 2 },
];

const UNSUPPORTED = /絶対に|必ず(儲か|稼げ|成功|痩せ|治)|100%|１００％|誰でも簡単に|確実に(稼|儲)|間違いなく|すぐに稼げる|元本保証|放置で(稼|儲)/g;
const INAPPROPRIATE = /死ね|殺してやる|違法ダウンロード|海賊版|ねずみ講|マルチ商法で稼|アダルト動画|裏ワザで(税金|審査)/g;
const PERSONAL_INFO = /\b0\d{1,4}-\d{1,4}-\d{3,4}\b|[\w.+-]+@[\w-]+\.[\w.]+/g;
const TYPOS: [RegExp, string][] = [
  [/シュミレーション/g, "シミュレーション"],
  [/コミニュケーション/g, "コミュニケーション"],
  [/ふいんき/g, "雰囲気"],
  [/以外と(簡単|多い|少ない|難しい)/g, "意外と"],
  [/(読み|使い|分かり|わかり|書き)ずら/g, "づら"],
  [/確立が(高|低)/g, "確率"],
  [/を(を)/g, "「をを」"],
  [/がが/g, "「がが」"],
  [/。。|、、/g, "句読点の重複"],
  [/すべからく/g, "（誤用されやすい語）"],
];

function plain(md: string): string {
  return md
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^#+\s.*$/gm, "")
    .replace(/[*_`>#-]/g, "")
    .replace(/\s+/g, "");
}

function sentences(md: string): string[] {
  return md
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/^#+\s.*$/gm, "")
    .split(/(?<=[。！？!?])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function shingles(text: string, n = 10): Set<string> {
  const t = plain(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n));
  return out;
}

/** Fraction of the article's shingles that also appear in `ref`. */
export function containment(article: string, ref: string): number {
  const a = shingles(article);
  if (a.size === 0) return 0;
  const r = shingles(ref);
  let hit = 0;
  for (const s of a) if (r.has(s)) hit++;
  return hit / a.size;
}

/**
 * CONTENT QUALITY CONTROL. Rule-based checks (deterministic, explainable)
 * plus an optional LLM editorial review when a real LLM is configured.
 * Score is out of 100; below the threshold the article goes back to the Writer.
 */
export async function runQualityControl(article: Article, opts: QualityOptions): Promise<QualityReport> {
  const issues: QualityIssue[] = [];
  const add = (check: string, severity: QualityIssue["severity"], message: string, penalty: number) => issues.push({ check, severity, message, penalty });
  const md = article.body_markdown;
  const body = md.replace(/^---[\s\S]*?---\n?/m, "");
  const paid = article.mode === "PAID" || article.mode === "PARTIAL_PAID";
  const sents = sentences(body);
  const now = opts.now ?? new Date();

  // --- タイトル ---
  const tlen = [...article.title].length;
  if (tlen < 10) add("タイトル", "major", `タイトルが短すぎます（${tlen}字）。読者と得られる結果が伝わる長さに。`, 6);
  if (tlen > 45) add("タイトル", "minor", `タイトルが長すぎます（${tlen}字）。`, 4);
  if (/衝撃|ヤバい|やばすぎ|知らないと損|絶対/.test(article.title)) add("タイトル", "major", "煽り表現がタイトルに含まれています。", 5);

  // --- 構成（導入・本編・結論・CTA）---
  const firstH2 = body.search(/^##\s/m);
  const introText = plain(firstH2 > 0 ? body.slice(0, firstH2) : "");
  if (introText.length < 80) add("導入", "major", "見出しの前に読者の状況に触れる導入がありません（または短すぎます）。", 10);
  const h2 = (body.match(/^##\s.+$/gm) ?? []).map((h) => h.replace(/^##\s+/, ""));
  if (h2.length < 3) add("構成", "major", `本編の見出しが${h2.length}個しかありません。`, 10);
  if (!h2.some((h) => /まとめ|おわりに|最後に|結論|終わりに/.test(h))) add("構成", "minor", "結論（まとめ）のセクションがありません。", 6);
  const tail = body.slice(Math.floor(body.length * 0.75));
  if (!/コメント|フォロー|スキ|シェア|感想|教えて|マガジン|購入|保存|次の記事/.test(tail)) add("CTA", "major", "記事の終盤に読者への行動の呼びかけ（CTA）がありません。", 8);

  // --- 文字数 ---
  const total = plain(body).length;
  if (total < 1200) add("読者価値", "major", `本文が短すぎます（約${total}字）。`, 15);
  else if (total < 1800) add("読者価値", "minor", `本文がやや短めです（約${total}字）。`, 4);

  // --- 誤字 ---
  let typoPenalty = 0;
  for (const [re, fix] of TYPOS) {
    const m = body.match(re);
    if (m) {
      const p = Math.min(2 * m.length, 10 - typoPenalty);
      if (p > 0) add("誤字", "minor", `「${m[0]}」→ ${fix}`, p);
      typoPenalty += p;
    }
  }
  const open = (body.match(/「/g) ?? []).length;
  const close = (body.match(/」/g) ?? []).length;
  if (open !== close) add("誤字", "minor", `かぎ括弧の数が一致しません（「${open} / 」${close}）。`, 2);

  // --- 日本語の自然さ ---
  const longS = sents.filter((s) => [...s].length > 120);
  if (longS.length) add("日本語", "minor", `120字を超える長文が${longS.length}文あります。`, Math.min(6, longS.length * 2));
  const endings = sents.map((s) => (/(です|ます|でした|ました|ません)[。！？]?$/.test(s) ? "desu" : /(だ|である|だった|ない)[。]$/.test(s) ? "da" : "other"));
  const desu = endings.filter((e) => e === "desu").length;
  const da = endings.filter((e) => e === "da").length;
  if (desu > 5 && da > 5 && Math.min(desu, da) / (desu + da) > 0.2) add("日本語", "major", "です・ます調とだ・である調が混在しています。", 6);
  let run = 1;
  let monotone = 0;
  for (let i = 1; i < sents.length; i++) {
    const tailOf = (s: string) => s.replace(/[。！？!?]$/, "").slice(-3);
    run = tailOf(sents[i]) === tailOf(sents[i - 1]) ? run + 1 : 1;
    if (run === 4) monotone++;
  }
  if (monotone) add("日本語", "minor", `同じ文末が4回以上連続する箇所が${monotone}か所あります。`, Math.min(6, monotone * 2));

  // --- 重複 ---
  const seen = new Map<string, number>();
  for (const s of sents) {
    const k = s.replace(/\s/g, "");
    if (k.length < 15) continue;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dups = [...seen.entries()].filter(([, c]) => c > 1);
  if (dups.length) add("重複", "major", `同じ文が繰り返されています: 「${dups[0][0].slice(0, 30)}…」ほか${dups.length}件`, Math.min(12, dups.length * 4));

  // --- AI臭 ---
  let smell = 0;
  for (const r of AI_SMELL) {
    const c = (body.match(r.phrase) ?? []).length;
    if (c > r.allow) {
      const p = Math.min((c - r.allow) * r.penalty, 15 - smell);
      if (p > 0) add("AI臭", c - r.allow > 1 ? "major" : "minor", `定型句「${r.label}」が${c}回使われています。`, p);
      smell += Math.max(p, 0);
    }
  }
  const lines = body.split("\n").filter((l) => l.trim());
  const bullets = lines.filter((l) => /^\s*([-*・]|\d+[.)])\s/.test(l)).length;
  const ratio = lines.length ? bullets / lines.length : 0;
  if (ratio > 0.4) add("AI臭", "major", `箇条書きが多すぎます（${Math.round(ratio * 100)}%）。段落で語ってください。`, 8);
  else if (ratio > 0.25) add("AI臭", "minor", `箇条書きがやや多めです（${Math.round(ratio * 100)}%）。`, 4);

  // --- 根拠のない断定 ---
  const claims = body.match(UNSUPPORTED) ?? [];
  if (claims.length) add("根拠のない断定", "major", `断定・誇大表現: ${[...new Set(claims)].join(", ")}`, Math.min(15, claims.length * 5));
  const statSents = sents.filter((s) => /\d+(\.\d+)?\s?(%|％|割)/.test(s) && !/出典|調査|によると|執筆時点|統計|データ|公表/.test(s));
  if (statSents.length) add("根拠のない断定", "minor", `出典のない数値が${statSents.length}か所あります。`, Math.min(6, statSents.length * 2));

  // --- 古い情報 ---
  const year = now.getFullYear();
  const stale = sents.filter((s) => {
    const ys = (s.match(/(20\d{2})年/g) ?? []).map((y) => Number(y.slice(0, 4)));
    return ys.some((y) => y <= year - 2) && /最新|今年|現在|今月|話題の/.test(s);
  });
  if (stale.length) add("古い情報", "major", `古い年を「最新/現在」として扱っている可能性: 「${stale[0].slice(0, 40)}」`, Math.min(8, stale.length * 4));

  // --- 読者価値（具体性）---
  const examples = (body.match(/たとえば|例えば|具体的|実際|場面|ケース|例を/g) ?? []).length;
  if (examples < 2) add("読者価値", "major", "具体例が不足しています。", 6);
  const actions = (body.match(/手順|ステップ|まず|次に|最後に|試して|始め|決め/g) ?? []).length;
  if (actions < 2) add("読者価値", "minor", "読者が実行できる行動が示されていません。", 4);

  // --- 有料部分の価値 ---
  if (paid) {
    const markerIdx = body.indexOf(PAID_MARKER);
    const freeTxt = markerIdx >= 0 ? body.slice(0, markerIdx) : article.free_part;
    const paidTxt = markerIdx >= 0 ? body.slice(markerIdx) : article.paid_part;
    const fc = plain(freeTxt).length;
    const pc = plain(paidTxt).length;
    if (!paidTxt.trim() || pc < 100) {
      add("有料部分の価値", "critical", "有料記事なのに有料部分がありません。", 25);
    } else {
      if (pc < 700) add("有料部分の価値", "major", `有料部分が短すぎます（約${pc}字）。価格${article.price}円に見合う内容か再検討してください。`, 10);
      if (pc < fc * 0.3) add("有料部分の価値", "minor", "有料部分が無料部分に比べて薄いです。", 5);
      if (!/手順|テンプレート|チェックリスト|具体的|ステップ|ルール|スケジュール|進め方|方法/.test(paidTxt)) add("有料部分の価値", "major", "有料部分に実行可能な具体策（手順・テンプレート等）が見当たりません。", 8);
      if (article.price >= 3000 && pc < 3000) add("有料部分の価値", "major", `価格${article.price}円に対して有料部分の分量が少なすぎます。`, 8);
      if (!/ここから先|この先では|ここからは|続きでは/.test(freeTxt.slice(-600))) add("有料部分への遷移", "minor", "有料部分への自然な予告（「ここから先では〜」）がありません。", 5);
      const overlap = containment(paidTxt, freeTxt);
      if (overlap > 0.3) add("有料部分の価値", "major", `有料部分が無料部分の繰り返しになっています（重複率${Math.round(overlap * 100)}%）。水増しは不可。`, 10);
      if (fc < 600) add("有料部分の価値", "major", "無料部分だけでは読者が価値を得られません（無料部分が短すぎます）。", 8);
    }
    if (article.price <= 0) add("価格", "major", "有料記事の価格が設定されていません。", 8);
  } else if (article.paid_part.trim()) {
    add("構成", "minor", "無料記事に有料パートの区切りが残っています。", 3);
  }

  // --- コピーコンテンツ / 著作権 ---
  for (const ref of opts.references ?? []) {
    if (!ref.text || ref.text.length < 50) continue;
    const c = containment(body, ref.text);
    if (c > 0.15) {
      add("コピーコンテンツ", "critical", `既存テキスト(${ref.id})との重複率が${Math.round(c * 100)}%あります。`, 30);
      break;
    }
  }
  const longQuotes = (body.match(/「[^」]{80,}」/g) ?? []).length + (body.match(/^>\s.{80,}$/gm) ?? []).length;
  if (longQuotes) add("著作権", "major", `長い引用が${longQuotes}か所あります。引用の必然性と出典表記を確認してください。`, 5);

  // --- 不適切な内容 ---
  const bad = body.match(INAPPROPRIATE) ?? [];
  if (bad.length) add("不適切な内容", "critical", `不適切な表現: ${[...new Set(bad)].join(", ")}`, 40);
  const pii = body.match(PERSONAL_INFO) ?? [];
  if (pii.length) add("不適切な内容", "critical", "電話番号やメールアドレスなどの個人情報が含まれています。", 15);

  let score = Math.max(0, 100 - issues.reduce((s, i) => s + i.penalty, 0));

  // --- LLM editorial review (only with a real model) ---
  if (opts.llm && !opts.llm.isMock) {
    const ctx = { markdown: md, mode: article.mode, price: article.price };
    const p = qualityReviewPrompt(ctx);
    try {
      const review = await generateJson(opts.llm, { task: "quality_review", system: p.system, prompt: p.prompt, context: ctx }, (v) => {
        const o = v as { score?: unknown; issues?: unknown };
        if (typeof o.score !== "number") throw new Error("score missing");
        return { score: Math.max(0, Math.min(100, o.score)), issues: Array.isArray(o.issues) ? (o.issues as QualityIssue[]) : [] };
      });
      for (const i of review.issues.slice(0, 15)) {
        const sev = (["minor", "major", "critical"].includes(i.severity) ? i.severity : "minor") as QualityIssue["severity"];
        add(`LLM:${i.check ?? "review"}`, sev, String(i.message ?? ""), 0);
      }
      score = Math.round(score * 0.6 + review.score * 0.4);
    } catch (e) {
      add("LLMレビュー", "info", `LLMレビューを実行できませんでした（ルールベースのみで採点）: ${(e as Error).message}`, 0);
    }
  }

  const breakdown: Record<string, number> = {};
  for (const i of issues) breakdown[i.check] = (breakdown[i.check] ?? 0) - i.penalty;
  const safe = !issues.some((i) => i.severity === "critical");
  return { article_id: article.article_id, score, passed: score >= opts.threshold && safe, issues, breakdown, safe_to_publish: safe };
}
