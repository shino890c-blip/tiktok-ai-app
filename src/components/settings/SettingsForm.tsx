"use client";

import { SettingsIcon, CheckIcon } from "@/components/icons";
import type { Settings } from "./types";

interface SettingsFormProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onSave: () => void;
}

export function SettingsForm({ settings, onChange, onSave }: SettingsFormProps) {
  const handleToggleAi = () => {
    onChange({ ...settings, aiEnabled: !settings.aiEnabled });
  };

  const handleTimezoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...settings, timezone: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#E8E6F0] bg-white p-4 sm:p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F3F0FF] text-[#7C3AED]">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#2D2B55]">アプリ設定</h2>
            <p className="text-sm text-[#6B6885]">AI機能やタイムゾーンを変更できます。</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-[#E8E6F0] p-4">
            <div>
              <label htmlFor="ai-toggle" className="block text-sm font-semibold text-[#2D2B55]">
                AI機能の有効/無効
              </label>
              <p className="text-xs text-[#6B6885] mt-1">
                無効にするとAI提案や自動生成機能が表示されなくなります。
              </p>
            </div>
            <button
              id="ai-toggle"
              type="button"
              role="switch"
              aria-checked={settings.aiEnabled}
              onClick={handleToggleAi}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] ${
                settings.aiEnabled ? "bg-[#7C3AED]" : "bg-[#E8E6F0]"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  settings.aiEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="timezone" className="block text-sm font-semibold text-[#2D2B55]">
              タイムゾーン
            </label>
            <div className="relative">
              <select
                id="timezone"
                value={settings.timezone}
                onChange={handleTimezoneChange}
                className="w-full appearance-none rounded-lg border border-[#E8E6F0] bg-white px-4 py-2.5 text-sm text-[#2D2B55] focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
              >
                <option value="Asia/Tokyo">Asia/Tokyo</option>
                <option value="Asia/Seoul">Asia/Seoul</option>
                <option value="Asia/Shanghai">Asia/Shanghai</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Europe/London">Europe/London</option>
                <option value="UTC">UTC</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B6885]" />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#7C3AED] px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-[#6D28D9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
            >
              <CheckIcon className="h-4 w-4" />
              保存
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-[#E8E6F0] bg-white p-4 sm:p-6 shadow-sm">
        <h3 className="text-sm font-bold text-[#2D2B55]">現在の設定状態</h3>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-[#F8F7FA] p-3">
            <dt className="text-xs text-[#6B6885]">AI機能</dt>
            <dd className="mt-1 text-sm font-semibold text-[#2D2B55]">
              {settings.aiEnabled ? "有効" : "無効"}
            </dd>
          </div>
          <div className="rounded-lg bg-[#F8F7FA] p-3">
            <dt className="text-xs text-[#6B6885]">タイムゾーン</dt>
            <dd className="mt-1 text-sm font-semibold text-[#2D2B55]">{settings.timezone}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
