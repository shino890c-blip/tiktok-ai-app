import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Revenue, RevenueSourceType } from "@/components/revenue/types";
import { SAMPLE_REVENUES } from "@/components/revenue/sample-data";
import type { RevenueRow } from "@/types/database";

function toRevenue(row: RevenueRow): Revenue {
  return {
    id: row.id,
    sourceType: row.source_type,
    amount: Number(row.amount),
    expense: Number(row.expense),
    recordDate: row.record_date,
    memo: row.memo ?? "",
  };
}

/**
 * 収益一覧を取得する。
 * Supabase未接続時はサンプルデータを返す。
 */
export async function getRevenues(): Promise<Revenue[]> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return SAMPLE_REVENUES;
  }

  const { data, error } = await client
    .from("revenues")
    .select("*")
    .order("record_date", { ascending: false });

  if (error || !data || data.length === 0) {
    return SAMPLE_REVENUES;
  }

  return data.map(toRevenue);
}

/**
 * 収益・経費を新規登録する。
 * Supabase未接続時はローカルで生成したレコードを返す（保存はされない）。
 */
export async function createRevenue(input: {
  sourceType: RevenueSourceType;
  amount: number;
  expense: number;
  recordDate: string;
  memo: string;
  postId?: string | null;
  accountId?: string | null;
}): Promise<Revenue> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return {
      id: `rev-${Date.now()}`,
      sourceType: input.sourceType,
      amount: input.amount,
      expense: input.expense,
      recordDate: input.recordDate,
      memo: input.memo,
    };
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("ユーザーがログインしていません。");
  }

  const { data, error } = await client
    .from("revenues")
    .insert({
      user_id: userId,
      post_id: input.postId ?? null,
      account_id: input.accountId ?? null,
      source_type: input.sourceType,
      amount: input.amount,
      expense: input.expense,
      record_date: input.recordDate,
      memo: input.memo || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "収益の登録に失敗しました。");
  }

  return toRevenue(data);
}

/**
 * 収益・経費を更新する。
 */
export async function updateRevenue(
  id: string,
  input: Partial<{
    sourceType: RevenueSourceType;
    amount: number;
    expense: number;
    recordDate: string;
    memo: string;
  }>
): Promise<Revenue> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    const existing = SAMPLE_REVENUES.find((revenue) => revenue.id === id);
    return {
      id,
      sourceType: input.sourceType ?? existing?.sourceType ?? "other",
      amount: input.amount ?? existing?.amount ?? 0,
      expense: input.expense ?? existing?.expense ?? 0,
      recordDate: input.recordDate ?? existing?.recordDate ?? new Date().toISOString(),
      memo: input.memo ?? existing?.memo ?? "",
    };
  }

  const { data, error } = await client
    .from("revenues")
    .update({
      ...(input.sourceType !== undefined ? { source_type: input.sourceType } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.expense !== undefined ? { expense: input.expense } : {}),
      ...(input.recordDate !== undefined ? { record_date: input.recordDate } : {}),
      ...(input.memo !== undefined ? { memo: input.memo || null } : {}),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "収益の更新に失敗しました。");
  }

  return toRevenue(data);
}

/**
 * 収益・経費を削除する。
 */
export async function deleteRevenue(id: string): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return;
  }

  const { error } = await client.from("revenues").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
