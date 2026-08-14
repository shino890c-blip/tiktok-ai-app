import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Script, ScriptStructureItem } from "@/lib/video-generator/types";
import type { RiskLevel, ScriptRow } from "@/types/database";

/** データアクセス層で扱う台本レコード（バージョン履歴・承認状態を含む）。 */
export interface ScriptRecord {
  id: string;
  ideaId: string;
  version: number;
  hook: string;
  narration: string;
  structure: ScriptStructureItem[];
  videoPrompt: string;
  riskLevel: RiskLevel;
  isApproved: boolean;
  approvedAt: string | null;
  createdAt: string;
}

function toScriptRecord(row: ScriptRow): ScriptRecord {
  return {
    id: row.id,
    ideaId: row.idea_id,
    version: row.version,
    hook: row.hook ?? "",
    narration: row.narration ?? "",
    structure: row.structure ?? [],
    videoPrompt: row.video_prompt ?? "",
    riskLevel: row.risk_level,
    isApproved: row.is_approved,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
}

function createSampleRecord(ideaId: string, script: Script, version = 1): ScriptRecord {
  return {
    id: `script-${Date.now()}`,
    ideaId,
    version,
    hook: script.hook,
    narration: script.narration,
    structure: script.structure,
    videoPrompt: script.video_prompt,
    riskLevel: "low",
    isApproved: false,
    approvedAt: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 指定したネタの台本バージョン履歴を取得する（新しい順）。
 * Supabase未接続時は空配列を返す（画面側はローカルstateで管理する設計のため）。
 */
export async function getScripts(ideaId: string): Promise<ScriptRecord[]> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return [];
  }

  const { data, error } = await client
    .from("scripts")
    .select("*")
    .eq("idea_id", ideaId)
    .order("version", { ascending: false });

  if (error || !data || data.length === 0) {
    return [];
  }

  return data.map(toScriptRecord);
}

/**
 * 台本の新しいバージョンを作成する。
 * Supabase未接続時はローカルで生成したレコードを返す（保存はされない）。
 */
export async function createScript(ideaId: string, script: Script): Promise<ScriptRecord> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return createSampleRecord(ideaId, script);
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("ユーザーがログインしていません。");
  }

  const { data: latest } = await client
    .from("scripts")
    .select("version")
    .eq("idea_id", ideaId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;

  const { data, error } = await client
    .from("scripts")
    .insert({
      user_id: userId,
      idea_id: ideaId,
      version: nextVersion,
      hook: script.hook || null,
      narration: script.narration || null,
      structure: script.structure,
      video_prompt: script.video_prompt || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "台本の作成に失敗しました。");
  }

  return toScriptRecord(data);
}

/**
 * 台本を更新する（承認処理やリスクレベル変更を含む）。
 */
export async function updateScript(
  id: string,
  input: Partial<{
    hook: string;
    narration: string;
    structure: ScriptStructureItem[];
    videoPrompt: string;
    riskLevel: RiskLevel;
    isApproved: boolean;
  }>
): Promise<ScriptRecord> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return {
      id,
      ideaId: "",
      version: 1,
      hook: input.hook ?? "",
      narration: input.narration ?? "",
      structure: input.structure ?? [],
      videoPrompt: input.videoPrompt ?? "",
      riskLevel: input.riskLevel ?? "low",
      isApproved: input.isApproved ?? false,
      approvedAt: input.isApproved ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    };
  }

  const { data, error } = await client
    .from("scripts")
    .update({
      ...(input.hook !== undefined ? { hook: input.hook || null } : {}),
      ...(input.narration !== undefined ? { narration: input.narration || null } : {}),
      ...(input.structure !== undefined ? { structure: input.structure } : {}),
      ...(input.videoPrompt !== undefined ? { video_prompt: input.videoPrompt || null } : {}),
      ...(input.riskLevel !== undefined ? { risk_level: input.riskLevel } : {}),
      ...(input.isApproved !== undefined
        ? { is_approved: input.isApproved, approved_at: input.isApproved ? new Date().toISOString() : null }
        : {}),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "台本の更新に失敗しました。");
  }

  return toScriptRecord(data);
}
