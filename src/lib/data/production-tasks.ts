import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { ProductionStatus, ProductionTask } from "@/components/production/types";
import { INITIAL_TASKS, createTaskId } from "@/components/production/types";
import type { ProductionTaskRow } from "@/types/database";

interface ProductionTaskRowWithIdea extends ProductionTaskRow {
  ideas?: { title: string; genres?: { name: string } | null } | null;
}

function toProductionTask(row: ProductionTaskRowWithIdea): ProductionTask {
  return {
    id: row.id,
    ideaId: row.idea_id,
    title: row.ideas?.title ?? "",
    status: row.status,
    assigneeMemo: row.assignee_memo ?? "",
    genre: row.ideas?.genres?.name ?? "未分類",
    orderIndex: row.order_index,
  };
}

/**
 * 制作ボードのタスク一覧を取得する。
 * Supabase未接続時はサンプルデータを返す。
 */
export async function getTasks(): Promise<ProductionTask[]> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return INITIAL_TASKS;
  }

  const { data, error } = await client
    .from("production_tasks")
    .select("*, ideas(title, genres(name))")
    .order("order_index", { ascending: true });

  if (error || !data || data.length === 0) {
    return INITIAL_TASKS;
  }

  return (data as ProductionTaskRowWithIdea[]).map(toProductionTask);
}

/**
 * 制作タスクを新規作成する。
 * Supabase未接続時はローカルで生成したタスクを返す（保存はされない）。
 */
export async function createTask(input: {
  ideaId: string;
  title: string;
  assigneeMemo: string;
  genre: string;
  status: ProductionStatus;
  orderIndex: number;
}): Promise<ProductionTask> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return {
      id: createTaskId(),
      ideaId: input.ideaId,
      title: input.title,
      status: input.status,
      assigneeMemo: input.assigneeMemo,
      genre: input.genre || "未分類",
      orderIndex: input.orderIndex,
    };
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("ユーザーがログインしていません。");
  }

  const { data, error } = await client
    .from("production_tasks")
    .insert({
      user_id: userId,
      idea_id: input.ideaId,
      status: input.status,
      assignee_memo: input.assigneeMemo || null,
      order_index: input.orderIndex,
    })
    .select("*, ideas(title, genres(name))")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "タスクの作成に失敗しました。");
  }

  return toProductionTask(data as ProductionTaskRowWithIdea);
}

/**
 * タスクを更新する（担当メモ変更等）。
 */
export async function updateTask(
  id: string,
  input: Partial<{ assigneeMemo: string; status: ProductionStatus; orderIndex: number }>
): Promise<ProductionTask> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    const existing = INITIAL_TASKS.find((task) => task.id === id);
    return {
      id,
      ideaId: existing?.ideaId ?? "",
      title: existing?.title ?? "",
      status: input.status ?? existing?.status ?? "planning",
      assigneeMemo: input.assigneeMemo ?? existing?.assigneeMemo ?? "",
      genre: existing?.genre ?? "未分類",
      orderIndex: input.orderIndex ?? existing?.orderIndex ?? 0,
    };
  }

  const { data, error } = await client
    .from("production_tasks")
    .update({
      ...(input.assigneeMemo !== undefined ? { assignee_memo: input.assigneeMemo || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.orderIndex !== undefined ? { order_index: input.orderIndex } : {}),
    })
    .eq("id", id)
    .select("*, ideas(title, genres(name))")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "タスクの更新に失敗しました。");
  }

  return toProductionTask(data as ProductionTaskRowWithIdea);
}

/**
 * カンバンのドラッグ&ドロップによるステータス・並び順の変更をまとめて反映する。
 * Supabase未接続時は何もしない（画面側はローカルstateのみで管理される）。
 */
export async function moveTask(
  id: string,
  destination: { status: ProductionStatus; orderIndex: number }
): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return;
  }

  const { error } = await client
    .from("production_tasks")
    .update({ status: destination.status, order_index: destination.orderIndex })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
