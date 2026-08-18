"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

type Mode = "login" | "signup";

export default function LoginPage() {
  const { signIn, signUp, isSupabaseConfigured } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setIsSubmitting(true);

    const result = mode === "login" ? await signIn(email, password) : await signUp(email, password);

    if (result.error) {
      setErrorMessage(result.error);
    } else if (mode === "signup") {
      setInfoMessage("登録が完了しました。ログインしてください。");
      setMode("login");
      setPassword("");
    }

    setIsSubmitting(false);
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "signup" : "login"));
    setErrorMessage(null);
    setInfoMessage(null);
  };

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#7C3AED] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <div className="text-center">
            <div className="font-bold text-xl text-[#2D2B55]">TikTok AI</div>
            <div className="text-xs text-[#6B6885]">動画メディア管理</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E8E6F0] shadow-sm p-6 sm:p-8">
          <h1 className="text-xl font-bold text-[#2D2B55] mb-1">
            {mode === "login" ? "ログイン" : "新規登録"}
          </h1>
          <p className="text-sm text-[#6B6885] mb-6">
            {mode === "login"
              ? "メールアドレスとパスワードでログインしてください。"
              : "メールアドレスとパスワードを入力して新規登録してください。"}
          </p>

          {!isSupabaseConfigured && (
            <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
              Supabaseが設定されていないため、ログイン機能は利用できません。
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {infoMessage && (
            <div className="mb-4 rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-700">
              {infoMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#2D2B55] mb-1.5">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!isSupabaseConfigured}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-lg border border-[#E8E6F0] text-[#2D2B55] text-sm placeholder:text-[#6B6885]/60 focus:outline-none focus:ring-2 focus:ring-[#7C3AED] focus:border-transparent disabled:bg-[#F8F7FA] disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#2D2B55] mb-1.5">
                パスワード
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!isSupabaseConfigured}
                placeholder="6文字以上"
                className="w-full px-4 py-2.5 rounded-lg border border-[#E8E6F0] text-[#2D2B55] text-sm placeholder:text-[#6B6885]/60 focus:outline-none focus:ring-2 focus:ring-[#7C3AED] focus:border-transparent disabled:bg-[#F8F7FA] disabled:cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !isSupabaseConfigured}
              className="w-full py-2.5 rounded-lg bg-[#7C3AED] text-white text-sm font-medium hover:bg-[#6B2FD6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "処理中..." : mode === "login" ? "ログイン" : "登録する"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-[#6B6885]">
            {mode === "login" ? (
              <>
                アカウントをお持ちでない場合は{" "}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-[#7C3AED] font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded"
                >
                  新規登録
                </button>
              </>
            ) : (
              <>
                既にアカウントをお持ちの場合は{" "}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-[#7C3AED] font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded"
                >
                  ログイン
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
