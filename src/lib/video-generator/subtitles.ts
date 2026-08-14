import { promises as fs } from "fs";
import path from "path";
import { normalizeStructure } from "./structure";
import type { GenerateSubtitlesInput, GenerateSubtitlesResult } from "./types";

const SUBTITLE_DIR = path.join(process.cwd(), "public", "generated", "subtitles");

/** 秒数を SRT のタイムコード形式 (HH:MM:SS,mmm) に変換する */
function toSrtTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const milliseconds = Math.round((clamped - Math.floor(clamped)) * 1000);

  const pad = (value: number, length = 2) => String(value).padStart(length, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
}

/**
 * 台本の秒数構成からSRT形式の字幕テキストを生成する。
 * 外部APIは使用せず、ローカル処理のみで完結する。
 */
export function buildSrtContent(input: GenerateSubtitlesInput["script"]): string {
  const normalized = normalizeStructure(input.structure);

  const blocks = normalized.map((scene) => {
    const startCode = toSrtTimestamp(scene.startSec);
    const endCode = toSrtTimestamp(scene.endSec);
    return `${scene.sceneIndex}\n${startCode} --> ${endCode}\n${scene.content}\n`;
  });

  return blocks.join("\n");
}

/** SRT字幕ファイルを生成し public/generated/subtitles/ に保存する */
export async function generateSubtitles(
  input: GenerateSubtitlesInput
): Promise<GenerateSubtitlesResult> {
  const id = input.id ?? `subtitle-${Date.now()}`;
  const srtContent = buildSrtContent(input.script);

  await fs.mkdir(SUBTITLE_DIR, { recursive: true });

  const fileName = `${id}.srt`;
  const filePath = path.join(SUBTITLE_DIR, fileName);
  await fs.writeFile(filePath, srtContent, "utf-8");

  return {
    subtitleUrl: `/generated/subtitles/${fileName}`,
    filePath,
    srtContent,
  };
}
