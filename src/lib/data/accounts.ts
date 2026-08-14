import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Account, Platform } from "@/components/accounts/types";
import { SAMPLE_ACCOUNTS } from "@/components/accounts/sample-data";
import type { AccountRow } from "@/types/database";

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    platform: row.platform as Platform,
    name: row.account_name,
    memo: row.memo ?? "",
    createdAt: row.created_at,
  };
}

/**
 * アカウント一覧を取得する。
 * Supabase未接続時はサンプルデータを返す。
 */
export async function getAccounts(): Promise<Account[]> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return SAMPLE_ACCOUNTS;
  }

  const { data, error } = await client
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    return SAMPLE_ACCOUNTS;
  }

  return data.map(toAccount);
}

/**
 * アカウントを新規作成する。
 * Supabase未接続時はローカルで生成したオブジェクトを返す（保存はされない）。
 */
export async function createAccount(input: {
  platform: Platform;
  name: string;
  memo: string;
}): Promise<Account> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return {
      id: `acc-${Date.now()}`,
      platform: input.platform,
      name: input.name,
      memo: input.memo,
      createdAt: new Date().toISOString(),
    };
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("ユーザーがログインしていません。");
  }

  const { data, error } = await client
    .from("accounts")
    .insert({
      user_id: userId,
      platform: input.platform,
      account_name: input.name,
      memo: input.memo || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "アカウントの作成に失敗しました。");
  }

  return toAccount(data);
}

/**
 * アカウント情報を更新する。
 */
export async function updateAccount(
  id: string,
  input: Partial<{ platform: Platform; name: string; memo: string }>
): Promise<Account> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    const existing = SAMPLE_ACCOUNTS.find((account) => account.id === id);
    return {
      id,
      platform: input.platform ?? existing?.platform ?? "tiktok",
      name: input.name ?? existing?.name ?? "",
      memo: input.memo ?? existing?.memo ?? "",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
  }

  const { data, error } = await client
    .from("accounts")
    .update({
      ...(input.platform !== undefined ? { platform: input.platform } : {}),
      ...(input.name !== undefined ? { account_name: input.name } : {}),
      ...(input.memo !== undefined ? { memo: input.memo || null } : {}),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "アカウントの更新に失敗しました。");
  }

  return toAccount(data);
}

/**
 * アカウントを削除する。
 */
export async function deleteAccount(id: string): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return;
  }

  const { error } = await client.from("accounts").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
