import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * URLとして正しくパースできるかを確認する。
 * Vercelの環境変数に値を誤って二重貼り付けした場合など、
 * 壊れたURL文字列（例: "https://xxxhttps://xxx.supabase.co/...") を検出するために使う。
 */
function isValidHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Supabaseが接続可能な状態（環境変数が設定済み・かつ正しい形式）かどうかを判定する。
 * データアクセス層はこのフラグを見て、未接続時にサンプルデータへフォールバックする。
 */
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && isValidHttpUrl(supabaseUrl)
);

if (supabaseUrl && !isValidHttpUrl(supabaseUrl)) {
  console.error(
    `[supabase] NEXT_PUBLIC_SUPABASE_URLの形式が不正です: "${supabaseUrl}"\n` +
      "Vercelの環境変数設定で値が二重に貼り付けられていないか確認してください。"
  );
}

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
