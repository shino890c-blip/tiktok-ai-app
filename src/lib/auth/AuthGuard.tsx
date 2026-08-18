"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";

const PUBLIC_PATHS = ["/login"];

/**
 * ログイン状態に応じたページアクセス制御を行うガード。
 * 未ログイン時は/loginへ、ログイン済みで/loginにアクセスした場合はトップへリダイレクトする。
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isSupabaseConfigured } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (!isSupabaseConfigured || isLoading) return;

    if (!user && !isPublicPath) {
      router.replace("/login");
      return;
    }

    if (user && isPublicPath) {
      router.replace("/");
    }
  }, [user, isLoading, isPublicPath, isSupabaseConfigured, router]);

  if (!isSupabaseConfigured) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F7FA] flex items-center justify-center">
        <p className="text-sm text-[#6B6885]">読み込み中...</p>
      </div>
    );
  }

  if (!user && !isPublicPath) {
    return null;
  }

  if (user && isPublicPath) {
    return null;
  }

  return <>{children}</>;
}
