import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  AiSuggestion,
  AiSuggestionContent,
  AiSuggestionType,
  BasisConfidence,
} from "@/components/ai-suggestions/types";
import { SAMPLE_SUGGESTIONS } from "@/components/ai-suggestions/sample-data";
import type { AiSuggestionRow } from "@/types/database";

function toAiSuggestion(row: AiSuggestionRow): AiSuggestion {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    basisConfidence: row.basis_confidence,
    createdAt: row.created_at,
  };
}

/**
 * AI提案一覧を取得する。
 * Supabase未接続時はサンプルデータを返す。
 */
export async function getSuggestions(): Promise<AiSuggestion[]> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return SAMPLE_SUGGESTIONS;
  }

  const { data, error } = await client
    .from("ai_suggestions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    return SAMPLE_SUGGESTIONS;
  }

  return data.map(toAiSuggestion);
}

/**
 * AI提案を新規作成する（AIワークフローの手動トリガー結果を保存する想定）。
 * Supabase未接続時はローカルで生成したレコードを返す（保存はされない）。
 */
export async function createSuggestion(input: {
  type: AiSuggestionType;
  content: AiSuggestionContent;
  basisConfidence: BasisConfidence;
}): Promise<AiSuggestion> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseConfigured) {
    return {
      id: `sug-${Date.now()}`,
      type: input.type,
      content: input.content,
      basisConfidence: input.basisConfidence,
      createdAt: new Date().toISOString(),
    };
  }

  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("ユーザーがログインしていません。");
  }

  const { data, error } = await client
    .from("ai_suggestions")
    .insert({
      user_id: userId,
      type: input.type,
      content: input.content,
      basis_confidence: input.basisConfidence,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "AI提案の作成に失敗しました。");
  }

  return toAiSuggestion(data);
}
