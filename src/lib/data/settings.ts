import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Settings } from "@/components/settings/types";
import type { SettingsRow } from "@/types/database";

const DEFAULT_SETTINGS: Settings = {
  aiEnabled: true,
  timezone: "Asia/Tokyo",
};

function toSettings(row: SettingsRow): Settings {
  return {
    aiEnabled: row.ai_enabled,
    timezone: row.timezone,
  };
}

/**
 * ログイン中ユーザーの設定を取得する。
 * Supabase未接続時・レコード未作成時はデフォルト設定を返す。
 */
export async function getSettings(): Promise<Settings> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return DEFAULT_SETTINGS;
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    return DEFAULT_SETTINGS;
  }

  const { data, error } = await client
    .from("settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_SETTINGS;
  }

  return toSettings(data);
}

/**
 * 設定を更新する（レコードが無ければ作成する / upsert）。
 * Supabase未接続時は入力をそのまま返す（保存はされない）。
 */
export async function updateSettings(input: Partial<Settings>): Promise<Settings> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return { ...DEFAULT_SETTINGS, ...input };
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("ユーザーがログインしていません。");
  }

  const { data, error } = await client
    .from("settings")
    .upsert(
      {
        user_id: userId,
        ...(input.aiEnabled !== undefined ? { ai_enabled: input.aiEnabled } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "設定の更新に失敗しました。");
  }

  return toSettings(data);
}
