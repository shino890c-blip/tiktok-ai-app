import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Post } from "@/components/analytics/types";
import { initialPosts } from "@/components/analytics/sampleData";
import type { PostRow } from "@/types/database";

interface PostRowWithRelations extends PostRow {
  ideas?: { title: string; genres?: { name: string } | null } | null;
  accounts?: { account_name: string; platform: string } | null;
}

function toPost(row: PostRowWithRelations): Post {
  return {
    id: row.id,
    ideaId: row.idea_id,
    ideaTitle: row.ideas?.title ?? "",
    accountName: row.accounts?.account_name ?? "",
    platform: row.accounts?.platform ?? "",
    postedAt: row.posted_at ?? row.created_at,
    genre: row.ideas?.genres?.name ?? "",
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    saves: row.saves,
  };
}

/**
 * 投稿実績一覧を取得する。
 * Supabase未接続時はサンプルデータを返す。
 */
export async function getPosts(): Promise<Post[]> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return initialPosts;
  }

  const { data, error } = await client
    .from("posts")
    .select("*, ideas(title, genres(name)), accounts(account_name, platform)")
    .order("posted_at", { ascending: false });

  if (error || !data || data.length === 0) {
    return initialPosts;
  }

  return (data as PostRowWithRelations[]).map(toPost);
}

/**
 * 投稿実績を手入力で登録する。
 * Supabase未接続時はローカルで生成したレコードを返す（保存はされない）。
 */
export async function createPost(input: {
  ideaId: string;
  accountId: string;
  postedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}): Promise<Post> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return {
      id: `post-${Date.now()}`,
      ideaId: input.ideaId,
      ideaTitle: "",
      accountName: "",
      platform: "",
      postedAt: input.postedAt,
      genre: "",
      views: input.views,
      likes: input.likes,
      comments: input.comments,
      shares: input.shares,
      saves: input.saves,
    };
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("ユーザーがログインしていません。");
  }

  const { data, error } = await client
    .from("posts")
    .insert({
      user_id: userId,
      idea_id: input.ideaId,
      account_id: input.accountId,
      posted_at: input.postedAt,
      views: input.views,
      likes: input.likes,
      comments: input.comments,
      shares: input.shares,
      saves: input.saves,
      data_source: "manual",
    })
    .select("*, ideas(title, genres(name)), accounts(account_name, platform)")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "投稿実績の作成に失敗しました。");
  }

  return toPost(data as PostRowWithRelations);
}

/**
 * CSV取込済みの投稿実績（Post[]）をまとめて保存する。
 * ideaTitle・accountName からideas/accountsテーブルを検索し、
 * 一致するレコードが見つかった行のみ保存する（見つからない行はスキップ）。
 * Supabase未接続時は入力をそのまま返す（保存はされない）。
 */
export async function importPostsCsv(posts: Post[]): Promise<Post[]> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return posts;
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("ユーザーがログインしていません。");
  }

  const { data: ideaRows } = await client.from("ideas").select("id, title").eq("user_id", userId);
  const { data: accountRows } = await client
    .from("accounts")
    .select("id, account_name")
    .eq("user_id", userId);

  const ideaByTitle = new Map((ideaRows ?? []).map((row) => [row.title, row.id]));
  const accountByName = new Map((accountRows ?? []).map((row) => [row.account_name, row.id]));

  const insertRows = posts
    .map((post) => {
      const ideaId = ideaByTitle.get(post.ideaTitle);
      const accountId = accountByName.get(post.accountName);
      if (!ideaId || !accountId) return null;

      return {
        user_id: userId,
        idea_id: ideaId,
        account_id: accountId,
        posted_at: post.postedAt,
        views: post.views,
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        saves: post.saves,
        data_source: "csv" as const,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (insertRows.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("posts")
    .insert(insertRows)
    .select("*, ideas(title, genres(name)), accounts(account_name, platform)");

  if (error || !data) {
    throw new Error(error?.message ?? "CSV取込の保存に失敗しました。");
  }

  return (data as PostRowWithRelations[]).map(toPost);
}
