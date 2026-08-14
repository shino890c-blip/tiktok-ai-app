import type { Script } from "./types";

/**
 * リクエストボディが Script 型として妥当かを検証する。
 * 不正な場合はエラーメッセージ（日本語）を返す。
 */
export function validateScript(body: unknown): { script: Script } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "リクエストボディが不正です。台本データ(script)を指定してください。" };
  }

  const record = body as Record<string, unknown>;
  const scriptCandidate = "script" in record ? record.script : record;

  if (typeof scriptCandidate !== "object" || scriptCandidate === null) {
    return { error: "台本データ(script)が指定されていません。" };
  }

  const script = scriptCandidate as Record<string, unknown>;

  if (typeof script.hook !== "string" || script.hook.trim().length === 0) {
    return { error: "台本データの hook（冒頭フック文）が不正です。" };
  }

  if (typeof script.narration !== "string" || script.narration.trim().length === 0) {
    return { error: "台本データの narration（ナレーション原稿）が不正です。" };
  }

  if (!Array.isArray(script.structure) || script.structure.length === 0) {
    return { error: "台本データの structure（秒数構成）が不正です。" };
  }

  for (const item of script.structure) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).time !== "string" ||
      typeof (item as Record<string, unknown>).content !== "string"
    ) {
      return { error: "台本データの structure の各要素には time と content が必要です。" };
    }
  }

  if (typeof script.video_prompt !== "string") {
    return { error: "台本データの video_prompt が不正です。" };
  }

  return {
    script: {
      hook: script.hook,
      narration: script.narration,
      structure: script.structure as Script["structure"],
      video_prompt: script.video_prompt,
    },
  };
}
