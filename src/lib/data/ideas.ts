import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Idea, IdeaStatus } from "@/components/ideas/types";
import { SAMPLE_IDEAS } from "@/components/ideas/sample-data";
import type { IdeaRow, IdeaStatus as DbIdeaStatus } from "@/types/database";

/** UI上のステータス（draft/approved/rejected）とDB上のステータスの対応。 */
function toUiStatus(dbStatus: DbIdeaStatus): IdeaStatus {
  if (dbStatus === "approved" || dbStatus === "selected") return "approved";
  if (dbStatus === "rejected") return "rejected";
  return "draft";
}

function toDbStatus(uiStatus: IdeaStatus): DbIdeaStatus {
  if (uiStatus === "approved") return "approved";
  if (uiStatus === "rejected") return "rejected";
  return "candidate";
}

interface IdeaRowWithGenre extends IdeaRow {
  genres?: { name: string } | null;
}

function toIdea(row: IdeaRowWithGenre): Idea {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    genre: row.genres?.name ?? "",
    aiScore: row.score,
    status: toUiStatus(row.status),
    isDuplicate: row.duplicate_flag,
    createdAt: row.created_at,
  };
}

/** ジャンル名からgenre_idを取得する。存在しない場合は新規作成する。 */
async function resolveGenreId(
  client: ReturnType<typeof getSupabaseBrowserClient>,
  userId: string,
  genreName: string
): Promise<string | null> {
  if (!client || !genreName) return null;

  const { data: existing } = await client
    .from("genres")
    .select("id")
    .eq("user_id", userId)
    .eq("name", genreName)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await client
    .from("genres")
    .insert({ user_id: userId, name: genreName })
    .select("id")
    .single();

  if (error || !created) return null;
  return created.id;
}

/**
 * ネタ一覧を取得する。
 * Supabase未接続時はサンプルデータを返す。
 */
export async function getIdeas(): Promise<Idea[]> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return SAMPLE_IDEAS;
  }

  const { data, error } = await client
    .from("ideas")
    .select("*, genres(name)")
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    return SAMPLE_IDEAS;
  }

  return (data as IdeaRowWithGenre[]).map(toIdea);
}

/**
 * ネタを新規作成する。
 * Supabase未接続時はローカルで生成したオブジェクトを返す（保存はされない）。
 */
export async function createIdea(input: {
  title: string;
  description: string;
  genre: string;
}): Promise<Idea> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return {
      id: `idea-${Date.now()}`,
      title: input.title,
      description: input.description,
      genre: input.genre,
      aiScore: null,
      status: "draft",
      isDuplicate: false,
      createdAt: new Date().toISOString(),
    };
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("ユーザーがログインしていません。");
  }

  const genreId = await resolveGenreId(client, userId, input.genre);

  const { data, error } = await client
    .from("ideas")
    .insert({
      user_id: userId,
      genre_id: genreId,
      title: input.title,
      description: input.description || null,
      source: "manual",
    })
    .select("*, genres(name)")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "ネタの作成に失敗しました。");
  }

  return toIdea(data as IdeaRowWithGenre);
}

/**
 * ネタを更新する（承認／却下、スコア更新等を含む）。
 */
export async function updateIdea(
  id: string,
  input: Partial<{
    title: string;
    description: string;
    genre: string;
    aiScore: number | null;
    status: IdeaStatus;
    isDuplicate: boolean;
  }>
): Promise<Idea> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    const existing = SAMPLE_IDEAS.find((idea) => idea.id === id);
    return {
      id,
      title: input.title ?? existing?.title ?? "",
      description: input.description ?? existing?.description ?? "",
      genre: input.genre ?? existing?.genre ?? "",
      aiScore: input.aiScore ?? existing?.aiScore ?? null,
      status: input.status ?? existing?.status ?? "draft",
      isDuplicate: input.isDuplicate ?? existing?.isDuplicate ?? false,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;

  let genreId: string | null | undefined;
  if (input.genre !== undefined && userId) {
    genreId = await resolveGenreId(client, userId, input.genre);
  }

  const { data, error } = await client
    .from("ideas")
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(genreId !== undefined ? { genre_id: genreId } : {}),
      ...(input.aiScore !== undefined ? { score: input.aiScore } : {}),
      ...(input.status !== undefined ? { status: toDbStatus(input.status) } : {}),
      ...(input.isDuplicate !== undefined ? { duplicate_flag: input.isDuplicate } : {}),
    })
    .eq("id", id)
    .select("*, genres(name)")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "ネタの更新に失敗しました。");
  }

  return toIdea(data as IdeaRowWithGenre);
}

/**
 * ネタを削除する。
 */
export async function deleteIdea(id: string): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return;
  }

  const { error } = await client.from("ideas").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
