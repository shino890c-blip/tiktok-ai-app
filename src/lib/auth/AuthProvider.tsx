"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

interface AuthResult {
  error: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isSupabaseConfigured: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * 新規登録直後にユーザーの初期データ（settingsレコード）を作成する。
 * 失敗してもサインアップ自体は成功として扱う（設定は初回アクセス時に再作成を試みる）。
 */
async function createInitialUserData(userId: string) {
  const client = getSupabaseBrowserClient();
  if (!client) return;

  await client
    .from("settings")
    .upsert(
      {
        user_id: userId,
        ai_enabled: true,
        timezone: "Asia/Tokyo",
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    );
}

/**
 * Supabase Authのセッションをアプリ全体で共有するプロバイダー。
 * ログイン状態の取得・監視、ログイン/新規登録/ログアウトの操作を提供する。
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      return;
    }

    let cancelled = false;

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setIsLoading(false);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      return { error: "Supabaseが設定されていません。" };
    }
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: translateAuthError(error.message) };
    }
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      return { error: "Supabaseが設定されていません。" };
    }
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) {
      return { error: translateAuthError(error.message) };
    }
    if (data.user) {
      await createInitialUserData(data.user.id);
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    await client.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
    }),
    [user, session, isLoading, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthはAuthProviderの内側で使用してください。");
  }
  return context;
}

function translateAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "メールアドレスまたはパスワードが正しくありません。";
  }
  if (message.includes("User already registered")) {
    return "このメールアドレスは既に登録されています。";
  }
  if (message.includes("Password should be at least")) {
    return "パスワードは6文字以上で入力してください。";
  }
  if (message.includes("Unable to validate email address")) {
    return "メールアドレスの形式が正しくありません。";
  }
  return message;
}
