import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Asset } from "@/components/assets/types";
import { createEmptyAsset, INITIAL_ASSETS } from "@/components/assets/types";
import type { AssetRow } from "@/types/database";

function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    ideaId: row.idea_id,
    videoUrl: row.video_url,
    thumbnailUrl: row.thumbnail_url,
    audioUrl: row.audio_url,
    imageUrls: row.image_urls ?? [],
    subtitleText: row.subtitle_text,
    rightsChecked: row.rights_checked,
    isApproved: row.is_approved,
    approvedAt: row.approved_at,
  };
}

/**
 * 指定したネタの素材情報を取得する。
 * Supabase未接続時はサンプルデータ、無ければ空の素材を返す。
 */
export async function getAsset(ideaId: string): Promise<Asset> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return INITIAL_ASSETS[ideaId] ?? createEmptyAsset(ideaId);
  }

  const { data, error } = await client
    .from("assets")
    .select("*")
    .eq("idea_id", ideaId)
    .maybeSingle();

  if (error || !data) {
    return createEmptyAsset(ideaId);
  }

  return toAsset(data);
}

/**
 * 素材レコードを新規作成する。
 * Supabase未接続時はローカルで生成したレコードを返す（保存はされない）。
 */
export async function createAsset(
  ideaId: string,
  input: Partial<{
    videoUrl: string | null;
    thumbnailUrl: string | null;
    audioUrl: string | null;
    imageUrls: string[];
    subtitleText: string | null;
    rightsChecked: boolean;
  }> = {}
): Promise<Asset> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return { ...createEmptyAsset(ideaId), ...input, imageUrls: input.imageUrls ?? [] };
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("ユーザーがログインしていません。");
  }

  const { data, error } = await client
    .from("assets")
    .insert({
      user_id: userId,
      idea_id: ideaId,
      video_url: input.videoUrl ?? null,
      thumbnail_url: input.thumbnailUrl ?? null,
      audio_url: input.audioUrl ?? null,
      image_urls: input.imageUrls ?? [],
      subtitle_text: input.subtitleText ?? null,
      rights_checked: input.rightsChecked ?? false,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "素材の作成に失敗しました。");
  }

  return toAsset(data);
}

/**
 * 素材情報を更新する（URL登録・権利確認チェック等）。
 */
export async function updateAsset(
  id: string,
  input: Partial<{
    videoUrl: string | null;
    thumbnailUrl: string | null;
    audioUrl: string | null;
    imageUrls: string[];
    subtitleText: string | null;
    rightsChecked: boolean;
  }>
): Promise<Asset> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return {
      id,
      ideaId: "",
      videoUrl: input.videoUrl ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      audioUrl: input.audioUrl ?? null,
      imageUrls: input.imageUrls ?? [],
      subtitleText: input.subtitleText ?? null,
      rightsChecked: input.rightsChecked ?? false,
      isApproved: false,
      approvedAt: null,
    };
  }

  const { data, error } = await client
    .from("assets")
    .update({
      ...(input.videoUrl !== undefined ? { video_url: input.videoUrl } : {}),
      ...(input.thumbnailUrl !== undefined ? { thumbnail_url: input.thumbnailUrl } : {}),
      ...(input.audioUrl !== undefined ? { audio_url: input.audioUrl } : {}),
      ...(input.imageUrls !== undefined ? { image_urls: input.imageUrls } : {}),
      ...(input.subtitleText !== undefined ? { subtitle_text: input.subtitleText } : {}),
      ...(input.rightsChecked !== undefined ? { rights_checked: input.rightsChecked } : {}),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "素材の更新に失敗しました。");
  }

  return toAsset(data);
}

/**
 * 素材を承認する（承認フロー・確認ダイアログ後に呼び出す想定）。
 */
export async function approveAsset(id: string): Promise<Asset> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return {
      id,
      ideaId: "",
      videoUrl: null,
      thumbnailUrl: null,
      audioUrl: null,
      imageUrls: [],
      subtitleText: null,
      rightsChecked: true,
      isApproved: true,
      approvedAt: new Date().toISOString(),
    };
  }

  const { data, error } = await client
    .from("assets")
    .update({ is_approved: true, approved_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "素材の承認に失敗しました。");
  }

  return toAsset(data);
}
