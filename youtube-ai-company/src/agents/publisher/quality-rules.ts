import type { QCIssue, ScriptOutput } from "../schemas.js";

export interface QualityRuleOptions {
  minDurationSec: number;
  maxDurationSec: number;
  experimentVariant?: string | null;
  privacyStatus: string;
  allowPublic: boolean;
  /** Max narration characters per second before audio/subtitle drift becomes likely (Japanese fast narration ≈ 10–12). */
  maxCharsPerSecond?: number;
}

export const MISLEADING_PHRASES = [
  "絶対に治る",
  "必ず治る",
  "必ず儲かる",
  "確実に儲かる",
  "誰でも簡単に稼げる",
  "確実に痩せる",
  "飲むだけで痩せる",
  "100%成功",
  "医者が隠す",
  "政府が隠す",
  "副作用なし",
];

export const CLICKBAIT_WORDS = ["衝撃", "ヤバすぎ", "閲覧注意", "放送事故", "人生終了"];

const MEDICAL_PATTERN = /(治る|治療|病気|薬|症状|ダイエット効果)/;
const DISCLAIMER_PATTERN = /(専門家|医療機関|医師|一般的な情報)/;

function textOf(s: ScriptOutput): string {
  return [s.title_candidates.join(" "), s.hook.narration, s.hook.telop, ...s.scenes.map((x) => `${x.narration} ${x.telop}`), s.cta, s.description].join("\n");
}

/** YouTube title rules: 1..100 chars, no angle brackets. */
export function isValidTitle(t: string): boolean {
  return t.trim().length >= 5 && [...t].length <= 100 && !/[<>]/.test(t);
}

/**
 * Deterministic quality checks. The LLM review complements these but cannot override a blocker.
 * Media-level checks (actual audio, subtitle timing, visual glitches) need the rendered file and
 * are surfaced as a human checklist instead of being guessed.
 */
export function runQualityRules(s: ScriptOutput, o: QualityRuleOptions): QCIssue[] {
  const issues: QCIssue[] = [];
  const add = (severity: QCIssue["severity"], field: string, message: string, suggestion = "") =>
    issues.push({ severity, field, message, suggestion });
  const maxCps = o.maxCharsPerSecond ?? 12;

  // Title
  if (s.title_candidates.length !== 3) add("major", "title", "タイトル候補が3つではない");
  if (!s.title_candidates.some(isValidTitle)) add("blocker", "title", "有効なタイトル候補がない（5〜100文字、<>不可）");
  for (const t of s.title_candidates) {
    if ([...t].length > 100) add("major", "title", `タイトルが100文字を超えている: ${t.slice(0, 20)}…`);
  }

  // Hook
  const first = s.scenes[0];
  if (!s.hook.narration.trim()) add("blocker", "hook", "冒頭フックのナレーションがない");
  if (!first || first.start_sec !== 0) add("major", "hook", "最初のシーンが0秒から始まっていない");
  else if (first.end_sec > 3.5) add("major", "hook", "冒頭シーンが長すぎる（3秒以内に次の展開へ）", "フックを2〜3秒に収める");

  // Duration
  const d = s.estimated_duration_sec;
  if (d < o.minDurationSec || d > o.maxDurationSec) {
    add("blocker", "duration", `動画尺${d}秒がShortsの許容範囲(${o.minDurationSec}〜${o.maxDurationSec}秒)外`);
  }
  if (o.experimentVariant?.startsWith("duration:")) {
    const target = Number(o.experimentVariant.split(/[:\s—]/)[1]);
    if (Number.isFinite(target) && Math.abs(d - target) > 5) {
      add("major", "duration", `実験条件(${target}秒)と台本の尺(${d}秒)が一致しない`, `${target}秒前後に調整`);
    }
  }

  // Scene continuity (proxy for video glitches / audio-subtitle drift)
  for (let i = 0; i < s.scenes.length; i++) {
    const sc = s.scenes[i]!;
    const len = sc.end_sec - sc.start_sec;
    if (len <= 0) {
      add("blocker", `scenes[${i}]`, "シーンの終了時刻が開始時刻以前");
      continue;
    }
    const next = s.scenes[i + 1];
    if (next && Math.abs(next.start_sec - sc.end_sec) > 0.5) {
      add("major", `scenes[${i}]`, `シーン${sc.scene_no}と次のシーンの間に${(next.start_sec - sc.end_sec).toFixed(1)}秒の隙間/重なり`);
    }
    const cps = [...sc.narration].length / len;
    if (cps > maxCps * 1.5) add("blocker", `scenes[${i}]`, `ナレーションが速すぎる(${cps.toFixed(1)}字/秒)：音声と字幕が確実にズレる`);
    else if (cps > maxCps) add("major", `scenes[${i}]`, `ナレーションがやや速い(${cps.toFixed(1)}字/秒)：音声と字幕のズレに注意`);
    if (!sc.telop.trim()) add("minor", `scenes[${i}]`, "テロップがない");
    else if ([...sc.telop].length > 22) add("minor", `scenes[${i}]`, "テロップが長く読み切れない可能性");
    if (!sc.visual.trim()) add("major", `scenes[${i}]`, "映像指示がない");
  }
  const lastEnd = s.scenes.length ? s.scenes[s.scenes.length - 1]!.end_sec : 0;
  if (Math.abs(lastEnd - d) > 1) add("major", "duration", `想定尺(${d}秒)と最終シーン終了(${lastEnd}秒)が一致しない`);

  // Typos / unnatural text
  const all = textOf(s);
  if (/([。、！？!?])\1/.test(all)) add("minor", "text", "句読点の重複がある（誤字の可能性）");
  if (/(.)\1{4,}/u.test(all.replace(/[ー〜～.…]/g, ""))) add("minor", "text", "同じ文字が5回以上連続している");
  if (/[｡-ﾟ]/.test(all)) add("minor", "text", "半角カナが含まれている");
  if (/\b(undefined|null|NaN|TODO)\b/.test(all)) add("blocker", "text", "プレースホルダー/生成エラー文字列が含まれている");

  // CTA / description / hashtags / privacy
  if (!s.cta.trim()) add("blocker", "cta", "CTAがない");
  if (!s.description.trim()) add("blocker", "description", "説明文がない");
  if ([...s.description].length > 4500) add("blocker", "description", "説明文が長すぎる（YouTube上限5000文字）");
  if (s.hashtags.length === 0 || s.hashtags.length > 15) add("major", "hashtags", "ハッシュタグは1〜15個にする");
  if (!s.hashtags.some((h) => h.toLowerCase() === "#shorts")) add("minor", "hashtags", "#Shorts がない");
  if (!["private", "unlisted", "public"].includes(o.privacyStatus)) add("blocker", "privacy", `不正な公開設定: ${o.privacyStatus}`);
  if (o.privacyStatus === "public" && !o.allowPublic) add("blocker", "privacy", "公開(public)設定は明示的に許可されていない");

  // Safety: misleading claims / clickbait / medical
  for (const p of MISLEADING_PHRASES) if (all.includes(p)) add("blocker", "safety", `誤解・虚偽を招く表現: 「${p}」`);
  for (const w of CLICKBAIT_WORDS) if (all.includes(w)) add("minor", "safety", `過度な煽り表現: 「${w}」`);
  if (MEDICAL_PATTERN.test(all) && !DISCLAIMER_PATTERN.test(s.description)) {
    add("major", "safety", "健康・医療に関わる内容だが、説明文に注意書きがない", "説明文に『一般的な情報です。専門家にご相談ください』等を追記");
  }
  return issues;
}

export function humanChecklist(s: ScriptOutput): string[] {
  return [
    "レンダリングされた動画（data/videos/）を再生し、音声・字幕・映像を確認",
    "BGM・効果音・素材が著作権的に利用可能か確認",
    ...s.fact_check_notes.map((n) => `事実確認: ${n}`),
  ];
}
