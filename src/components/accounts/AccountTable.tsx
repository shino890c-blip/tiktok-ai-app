"use client";

import { motion } from "framer-motion";
import { EditIcon, TrashIcon, UsersIcon } from "@/components/icons";
import type { Account } from "@/components/accounts/types";
import { PLATFORM_COLORS, PLATFORM_LABELS } from "@/components/accounts/types";

interface AccountTableProps {
  accounts: Account[];
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
}

/** アカウント一覧をテーブル（PC）/カード（モバイル）で表示する。 */
export function AccountTable({ accounts, onEdit, onDelete }: AccountTableProps) {
  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#E8E6F0] bg-white py-16 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F3F0FF] text-[#7C3AED]">
          <UsersIcon className="w-6 h-6" />
        </div>
        <p className="text-sm text-[#6B6885]">登録されているアカウントがありません。</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#E8E6F0] bg-white shadow-sm overflow-hidden">
      {/* デスクトップ・タブレット: テーブル表示 */}
      <table className="hidden w-full text-left sm:table">
        <thead>
          <tr className="border-b border-[#E8E6F0] bg-[#F8F7FA] text-xs font-semibold text-[#6B6885]">
            <th scope="col" className="px-5 py-3">プラットフォーム</th>
            <th scope="col" className="px-5 py-3">アカウント名</th>
            <th scope="col" className="px-5 py-3">メモ</th>
            <th scope="col" className="px-5 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account, index) => {
            const color = PLATFORM_COLORS[account.platform];
            return (
              <motion.tr
                key={account.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.03 }}
                className="border-b border-[#E8E6F0] last:border-0 hover:bg-[#F8F7FA] transition-colors"
              >
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${color.bg} ${color.text}`}>
                    {PLATFORM_LABELS[account.platform]}
                  </span>
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-[#2D2B55]">{account.name}</td>
                <td className="px-5 py-4 text-sm text-[#6B6885] max-w-xs">
                  <span className="line-clamp-2">{account.memo || "—"}</span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      aria-label={`${account.name}を編集`}
                      onClick={() => onEdit(account)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B6885] hover:bg-[#F3F0FF] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`${account.name}を削除`}
                      onClick={() => onDelete(account)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B6885] hover:bg-[#FEE2E2] hover:text-[#EF4444] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>

      {/* モバイル: カード表示 */}
      <ul className="divide-y divide-[#E8E6F0] sm:hidden">
        {accounts.map((account, index) => {
          const color = PLATFORM_COLORS[account.platform];
          return (
            <motion.li
              key={account.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.03 }}
              className="p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${color.bg} ${color.text}`}>
                    {PLATFORM_LABELS[account.platform]}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-[#2D2B55]">{account.name}</p>
                  <p className="mt-1 text-xs text-[#6B6885]">{account.memo || "—"}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label={`${account.name}を編集`}
                    onClick={() => onEdit(account)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B6885] hover:bg-[#F3F0FF] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
                  >
                    <EditIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${account.name}を削除`}
                    onClick={() => onDelete(account)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B6885] hover:bg-[#FEE2E2] hover:text-[#EF4444] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
