import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * サーバー側（Server Components / Server Actions / API Routes）で
 * Service Role Keyを使ってSupabaseに接続可能かどうかを判定する。
 */
export const isSupabaseServerConfigured = Boolean(supabaseUrl && serviceRoleKey);

let serverClient: SupabaseClient<Database> | null = null;

/**
 * サーバー専用のSupabaseクライアントを取得する。
 * Service Role KeyはRLSをバイパスするため、絶対にクライアント側へ渡さないこと。
 * 環境変数が未設定の場合はnullを返す（呼び出し側でサンプルデータにフォールバックすること）。
 */
export function getSupabaseServerClient(): SupabaseClient<Database> | null {
  if (!isSupabaseServerConfigured) {
    return null;
  }

  if (!serverClient) {
    serverClient = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serverClient;
}
