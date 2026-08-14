import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { NoteArticle } from "@/lib/note-generator/types";
import type { NoteArticleRow } from "@/types/database";

function toNoteArticle(row: NoteArticleRow): NoteArticle {
  return {
    id: row.id,
    ideaId: row.idea_id,
    title: row.title,
    body: row.body,
    hashtags: row.hashtags,
    eyeCatchPrompt: row.eye_catch_prompt ?? "",
    isGenerated: row.is_generated,
    generatedAt: row.generated_at,
  };
}

/**
 * 指定したネタのnote記事一覧を取得する（新しい順）。
 * Supabase未接続時は空配列を返す（画面側はローカルstateで管理する設計のため）。
 */
export async function getArticles(ideaId: string): Promise<NoteArticle[]> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return [];
  }

  const { data, error } = await client
    .from("note_articles")
    .select("*")
    .eq("idea_id", ideaId)
    .order("generated_at", { ascending: false });

  if (error || !data || data.length === 0) {
    return [];
  }

  return data.map(toNoteArticle);
}

/**
 * note記事を新規作成する（AI生成結果の保存）。
 * Supabase未接続時はローカルで生成したレコードを返す（保存はされない）。
 */
export async function createArticle(
  ideaId: string,
  input: {
    title: string;
    body: string;
    hashtags: string[];
    eyeCatchPrompt: string;
    isGenerated?: boolean;
  }
): Promise<NoteArticle> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return {
      id: `note-${Date.now()}`,
      ideaId,
      title: input.title,
      body: input.body,
      hashtags: input.hashtags,
      eyeCatchPrompt: input.eyeCatchPrompt,
      isGenerated: input.isGenerated ?? true,
      generatedAt: new Date().toISOString(),
    };
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("ユーザーがログインしていません。");
  }

  const { data, error } = await client
    .from("note_articles")
    .insert({
      user_id: userId,
      idea_id: ideaId,
      title: input.title,
      body: input.body,
      hashtags: input.hashtags,
      eye_catch_prompt: input.eyeCatchPrompt || null,
      is_generated: input.isGenerated ?? true,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "note記事の作成に失敗しました。");
  }

  return toNoteArticle(data);
}

/**
 * note記事を更新する（本文の手動編集等）。
 */
export async function updateArticle(
  id: string,
  input: Partial<{ title: string; body: string; hashtags: string[]; eyeCatchPrompt: string }>
): Promise<NoteArticle> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return {
      id,
      ideaId: "",
      title: input.title ?? "",
      body: input.body ?? "",
      hashtags: input.hashtags ?? [],
      eyeCatchPrompt: input.eyeCatchPrompt ?? "",
      isGenerated: true,
      generatedAt: new Date().toISOString(),
    };
  }

  const { data, error } = await client
    .from("note_articles")
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.hashtags !== undefined ? { hashtags: input.hashtags } : {}),
      ...(input.eyeCatchPrompt !== undefined ? { eye_catch_prompt: input.eyeCatchPrompt || null } : {}),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "note記事の更新に失敗しました。");
  }

  return toNoteArticle(data);
}
