import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Schedule, ScheduleStatus } from "@/components/calendar/types";
import { initialSchedules } from "@/components/calendar/sampleData";
import type { ScheduleRow } from "@/types/database";

interface ScheduleRowWithRelations extends ScheduleRow {
  ideas?: { title: string } | null;
  accounts?: { account_name: string; platform: string } | null;
}

function toSchedule(row: ScheduleRowWithRelations): Schedule {
  return {
    id: row.id,
    ideaId: row.idea_id,
    ideaTitle: row.ideas?.title ?? "",
    accountId: row.account_id,
    accountName: row.accounts?.account_name ?? "",
    platform: row.accounts?.platform ?? "",
    scheduledAt: row.scheduled_at,
    status: row.status,
  };
}

/**
 * 投稿予定一覧を取得する。
 * Supabase未接続時はサンプルデータを返す。
 */
export async function getSchedules(): Promise<Schedule[]> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return initialSchedules;
  }

  const { data, error } = await client
    .from("schedules")
    .select("*, ideas(title), accounts(account_name, platform)")
    .order("scheduled_at", { ascending: true });

  if (error || !data || data.length === 0) {
    return initialSchedules;
  }

  return (data as ScheduleRowWithRelations[]).map(toSchedule);
}

/**
 * 投稿予定を新規作成する。
 * Supabase未接続時はローカルで生成したレコードを返す（保存はされない）。
 */
export async function createSchedule(input: {
  ideaId: string;
  ideaTitle: string;
  accountId: string;
  accountName: string;
  platform: string;
  scheduledAt: string;
}): Promise<Schedule> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return {
      id: `sch-${Date.now()}`,
      ideaId: input.ideaId,
      ideaTitle: input.ideaTitle,
      accountId: input.accountId,
      accountName: input.accountName,
      platform: input.platform,
      scheduledAt: input.scheduledAt,
      status: "planned",
    };
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("ユーザーがログインしていません。");
  }

  const { data, error } = await client
    .from("schedules")
    .insert({
      user_id: userId,
      idea_id: input.ideaId,
      account_id: input.accountId,
      scheduled_at: input.scheduledAt,
    })
    .select("*, ideas(title), accounts(account_name, platform)")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "投稿予定の作成に失敗しました。");
  }

  return toSchedule(data as ScheduleRowWithRelations);
}

/**
 * 投稿予定を更新する（日時変更・ステータス変更を含む）。
 */
export async function updateSchedule(
  id: string,
  input: Partial<{ scheduledAt: string; status: ScheduleStatus }>
): Promise<Schedule> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    const existing = initialSchedules.find((schedule) => schedule.id === id);
    return {
      id,
      ideaId: existing?.ideaId ?? "",
      ideaTitle: existing?.ideaTitle ?? "",
      accountId: existing?.accountId ?? "",
      accountName: existing?.accountName ?? "",
      platform: existing?.platform ?? "",
      scheduledAt: input.scheduledAt ?? existing?.scheduledAt ?? new Date().toISOString(),
      status: input.status ?? existing?.status ?? "planned",
    };
  }

  const { data, error } = await client
    .from("schedules")
    .update({
      ...(input.scheduledAt !== undefined ? { scheduled_at: input.scheduledAt } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    })
    .eq("id", id)
    .select("*, ideas(title), accounts(account_name, platform)")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "投稿予定の更新に失敗しました。");
  }

  return toSchedule(data as ScheduleRowWithRelations);
}

/**
 * 投稿予定を削除する。
 */
export async function deleteSchedule(id: string): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return;
  }

  const { error } = await client.from("schedules").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
