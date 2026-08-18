"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  DashboardIcon,
  IdeaIcon,
  ScriptIcon,
  BoardIcon,
  CalendarIcon,
  MediaIcon,
  AnalyticsIcon,
  RevenueIcon,
  UsersIcon,
  SettingsIcon,
  SparkleIcon,
  MenuIcon,
  CloseIcon,
  NoteIcon,
  LogoutIcon,
} from "@/components/icons";

const DEFAULT_IDEA_ID = "sample-idea";
const DEFAULT_ASSET_IDEA_ID = "idea-7";

const navItems = [
  { id: "dashboard", label: "ダッシュボード", icon: DashboardIcon, href: "/" },
  { id: "ideas", label: "ネタ管理", icon: IdeaIcon, href: "/ideas" },
  { id: "scripts", label: "台本作成", icon: ScriptIcon, href: `/scripts/${DEFAULT_IDEA_ID}` },
  { id: "notes", label: "note記事生成", icon: NoteIcon, href: `/notes/${DEFAULT_IDEA_ID}` },
  { id: "board", label: "制作ボード", icon: BoardIcon, href: "/production" },
  { id: "calendar", label: "カレンダー", icon: CalendarIcon, href: "/calendar" },
  { id: "media", label: "素材管理", icon: MediaIcon, href: `/assets/${DEFAULT_ASSET_IDEA_ID}` },
  { id: "analytics", label: "分析", icon: AnalyticsIcon, href: "/analytics" },
  { id: "revenue", label: "収益管理", icon: RevenueIcon, href: "/revenue" },
  { id: "accounts", label: "アカウント管理", icon: UsersIcon, href: "/accounts" },
  { id: "ai-suggestions", label: "AI提案", icon: SparkleIcon, href: "/ai-suggestions" },
  { id: "settings", label: "設定", icon: SettingsIcon, href: "/settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut, isSupabaseConfigured } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = async () => {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
    setMobileOpen(false);
    router.replace("/login");
  };

  return (
    <>
      <button
        type="button"
        aria-label={mobileOpen ? "メニューを閉じる" : "メニューを開く"}
        aria-expanded={mobileOpen}
        aria-controls="sidebar-navigation"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-[#2D2B55] text-white p-2 rounded-lg shadow-md hover:bg-[#3e3c6e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
      >
        {mobileOpen ? <CloseIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
      </button>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.aside
        id="sidebar-navigation"
        initial={false}
        animate={{ x: mobileOpen ? 0 : "-100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed top-0 left-0 z-40 h-full w-64 bg-[#2D2B55] text-white flex flex-col shadow-xl lg:translate-x-0 lg:static lg:h-screen"
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#7C3AED] flex items-center justify-center">
            <PlayIcon />
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">TikTok AI</div>
            <div className="text-xs text-white/70">動画メディア管理</div>
          </div>
        </div>

        <nav className="flex-1 px-3 overflow-y-auto" aria-label="メインナビゲーション">
          <ul className="space-y-1" role="menubar">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.id === "dashboard"
                  ? pathname === "/"
                  : item.id === "scripts"
                    ? pathname.startsWith("/scripts")
                    : item.id === "notes"
                      ? pathname.startsWith("/notes")
                      : item.id === "ideas"
                        ? pathname.startsWith("/ideas")
                        : item.id === "accounts"
                          ? pathname.startsWith("/accounts")
                          : item.id === "board"
                            ? pathname.startsWith("/production")
                            : item.id === "media"
                              ? pathname.startsWith("/assets")
                              : item.id === "calendar"
                                ? pathname.startsWith("/calendar")
                                : item.id === "analytics"
                                  ? pathname.startsWith("/analytics")
                                  : item.id === "revenue"
                                    ? pathname.startsWith("/revenue")
                                    : item.id === "ai-suggestions"
                                      ? pathname.startsWith("/ai-suggestions")
                                      : item.id === "settings"
                                        ? pathname.startsWith("/settings")
                                        : false;
              return (
                <li key={item.id} role="none">
                  <Link
                    href={item.href}
                    role="menuitem"
                    onClick={() => setMobileOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] ${
                      isActive
                        ? "bg-[#7C3AED] text-white shadow-md"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-white/70"}`} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-white/10">
          {isSupabaseConfigured && user ? (
            <>
              <div className="px-1 mb-2 text-xs text-white/50 truncate">{user.email}</div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isSigningOut}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors disabled:opacity-60"
              >
                <LogoutIcon className="w-5 h-5 text-white/70" />
                {isSigningOut ? "ログアウト中..." : "ログアウト"}
              </button>
            </>
          ) : (
            <div className="text-xs text-white/50 text-center">サンプルデータ表示中</div>
          )}
        </div>
      </motion.aside>
    </>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <polygon points="5 3 19 12 5 21" />
    </svg>
  );
}
