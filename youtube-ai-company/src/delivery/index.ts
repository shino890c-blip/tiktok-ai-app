import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScriptOutput } from "../agents/schemas.js";
import type { VideoRecord } from "../database/types.js";
import { run } from "../video/process.js";

export interface DeliveryResult {
  folder: string;
  videoFile: string;
  infoFile: string;
  thumbnailFile: string | null;
  scriptFile: string;
}

export const DELIVERY_FILES = {
  video: "video.mp4",
  info: "アップロード情報.txt",
  thumbnail: "サムネイル.jpg",
  script: "台本.json",
} as const;

function safeName(s: string, max = 32): string {
  return [...s.replace(/[\\/:*?"<>|#\s]+/g, "_").replace(/_+/g, "_")].slice(0, max).join("").replace(/^_|_$/g, "") || "video";
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function buildUploadInfo(video: VideoRecord, script: ScriptOutput, opts: { aiVoice: boolean }): string {
  const alt = script.title_candidates.filter((t) => t !== video.title);
  const tags = video.tags.join(", ");
  return [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    " YouTube Shorts アップロード情報（コピーして使ってください）",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "【タイトル】",
    video.title,
    "",
    ...(alt.length ? ["【タイトル別案】", ...alt.map((t) => `・${t}`), ""] : []),
    "【説明文】",
    video.description,
    "",
    "【タグ】",
    tags,
    "",
    "【投稿手順（スマホのYouTubeアプリ）】",
    "1. ＋ボタン →「ショート」→ 右下の画像アイコンから video.mp4 を選ぶ",
    "2. 「次へ」→ タイトル欄に上のタイトルを貼り付け",
    "3. 「視聴者」→「いいえ、子ども向けではありません」",
    ...(opts.aiVoice
      ? ["4. 「改変または合成されたコンテンツ」の項目が出たら、AI音声を使っているので「はい」を推奨"]
      : ["4. （このファイルは無音です。必要ならアプリ内で音楽を追加してください）"]),
    "5. 「ショート動画をアップロード」",
    "   ※説明文は投稿後に「編集」から貼り付けるか、パソコンのYouTube Studioで投稿すると全部貼れます",
    "",
    "【公開前に確認すること】",
    "・動画を最後まで再生し、音声・字幕・テロップにおかしな所がないか",
    ...script.fact_check_notes.map((n) => `・事実確認: ${n}`),
    "",
    "【投稿したら（任意・AIが学習します）】",
    "数日後に YouTube Studio で再生数などを見て、次のコマンドで入力してください:",
    `npm run report -- ${video.video_id} --views 再生数 --likes 高評価数 --comments コメント数 --avg-percent 平均再生率`,
    "",
    `動画ID（社内管理用）: ${video.video_id}`,
  ].join("\n");
}

/**
 * Writes the finished deliverable to DELIVERY_DIR/<date>_<title>/:
 * video.mp4, サムネイル.jpg, アップロード情報.txt (copy-paste title/description/tags + steps), 台本.json.
 */
export async function deliverVideo(
  video: VideoRecord,
  script: ScriptOutput,
  opts: { deliveryDir: string; now: Date; ffmpegPath: string; aiVoice: boolean; placeholder: boolean },
): Promise<DeliveryResult> {
  if (!video.video_file_path) throw new Error("No rendered video file to deliver");
  const folder = path.join(opts.deliveryDir, `${stamp(opts.now)}_${safeName(video.title)}`);
  await mkdir(folder, { recursive: true });
  const videoFile = path.join(folder, DELIVERY_FILES.video);
  await copyFile(video.video_file_path, videoFile);

  let thumbnailFile: string | null = path.join(folder, DELIVERY_FILES.thumbnail);
  if (opts.placeholder) thumbnailFile = null;
  else {
    try {
      await run(opts.ffmpegPath, ["-y", "-v", "error", "-ss", "1.0", "-i", videoFile, "-frames:v", "1", "-q:v", "2", thumbnailFile], { timeoutMs: 60_000 });
    } catch {
      thumbnailFile = null; // a missing thumbnail must not block delivery
    }
  }

  const infoFile = path.join(folder, DELIVERY_FILES.info);
  await writeFile(infoFile, buildUploadInfo(video, script, { aiVoice: opts.aiVoice }), "utf8");
  const scriptFile = path.join(folder, DELIVERY_FILES.script);
  await writeFile(scriptFile, JSON.stringify(script, null, 2), "utf8");
  return { folder, videoFile, infoFile, thumbnailFile, scriptFile };
}
