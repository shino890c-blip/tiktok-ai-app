import type { ScriptStructureItem } from "./types";

/**
 * "0-5秒" のような time 表記を開始秒・終了秒に変換する。
 * パース不可の場合は前のシーンの終了秒から2秒間として扱う。
 */
export function parseTimeRange(
  time: string,
  fallbackStartSec: number
): { startSec: number; endSec: number } {
  const match = time.match(/(\d+(?:\.\d+)?)\s*[-~〜]\s*(\d+(?:\.\d+)?)/);
  if (match) {
    const startSec = Number(match[1]);
    const endSec = Number(match[2]);
    if (Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec) {
      return { startSec, endSec };
    }
  }
  return { startSec: fallbackStartSec, endSec: fallbackStartSec + 2 };
}

export interface NormalizedScene {
  sceneIndex: number;
  time: string;
  startSec: number;
  endSec: number;
  content: string;
}

/** 台本の秒数構成を開始秒・終了秒付きの配列に正規化する */
export function normalizeStructure(structure: ScriptStructureItem[]): NormalizedScene[] {
  let cursor = 0;
  return structure.map((item, index) => {
    const { startSec, endSec } = parseTimeRange(item.time, cursor);
    cursor = endSec;
    return {
      sceneIndex: index + 1,
      time: item.time,
      startSec,
      endSec,
      content: item.content,
    };
  });
}
