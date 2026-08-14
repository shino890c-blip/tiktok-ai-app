import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Supabaseが接続可能な状態（環境変数が設定済み）かどうかを判定する。
 * データアクセス層はこのフラグを見て、未接続時にサンプルデータへフォールバックする。
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let browserClient: SupabaseClient<Database> | null = null;

/**
 * ブラウザ（クライアントコンポーネント）から利用するSupabaseクライアントを取得する。
 * 環境変数が未設定の場合はnullを返す（呼び出し側でサンプルデータにフォールバックすること）。
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return browserClient;
}
