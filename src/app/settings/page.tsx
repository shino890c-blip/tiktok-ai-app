"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { Toast } from "@/components/ui/Toast";
import { getSettings, updateSettings } from "@/lib/data/settings";
import type { Settings } from "@/components/settings/types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    aiEnabled: true,
    timezone: "Asia/Tokyo",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("設定の取得に失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2200);
  };

  const handleSave = () => {
    updateSettings(settings)
      .then(() => {
        showToast("設定を保存しました");
      })
      .catch(() => {
        showToast("設定の保存に失敗しました");
      });
  };

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-[#E8E6F0] px-4 pl-14 sm:pl-16 lg:px-8 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#2D2B55]">設定</h1>
              <p className="text-sm text-[#6B6885] mt-1">
                アプリの動作に関する設定を変更できます。
              </p>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
          {loadError && (
            <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#E8E6F0] bg-white py-16 text-center shadow-sm">
              <p className="text-sm text-[#6B6885]">読み込み中...</p>
            </div>
          ) : (
            <SettingsForm
              settings={settings}
              onChange={setSettings}
              onSave={handleSave}
            />
          )}
        </div>
      </main>

      <Toast message={toastMessage} />
    </div>
  );
}
