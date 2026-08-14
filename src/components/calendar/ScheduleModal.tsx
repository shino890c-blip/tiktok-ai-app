"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangleIcon, CloseIcon, TrashIcon } from "@/components/icons";
import { sampleAccounts, sampleIdeas } from "./sampleData";
import type { Schedule, ScheduleStatus } from "./types";

function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

interface ScheduleModalProps {
  open: boolean;
  initialDate: Date | null;
  schedule: Schedule | null;
  onClose: () => void;
  onSave: (schedule: Schedule) => void;
  onDelete: (id: string) => void;
}

export function ScheduleModal({ open, initialDate, schedule, onClose, onSave, onDelete }: ScheduleModalProps) {
  if (!open) return null;

  return (
    <ScheduleModalContent
      key={schedule?.id ?? initialDate?.toISOString() ?? "new"}
      initialDate={initialDate}
      schedule={schedule}
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
    />
  );
}

interface ScheduleModalContentProps {
  initialDate: Date | null;
  schedule: Schedule | null;
  onClose: () => void;
  onSave: (schedule: Schedule) => void;
  onDelete: (id: string) => void;
}

function ScheduleModalContent({ initialDate, schedule, onClose, onSave, onDelete }: ScheduleModalContentProps) {
  const defaultDatetime = (() => {
    if (schedule) return toLocalInputValue(schedule.scheduledAt);
    const base = new Date(initialDate ?? new Date());
    base.setHours(20, 0, 0, 0);
    return toLocalInputValue(base.toISOString());
  })();

  const [ideaId, setIdeaId] = useState(schedule?.ideaId ?? sampleIdeas[0].id);
  const [accountId, setAccountId] = useState(schedule?.accountId ?? sampleAccounts[0].id);
  const [datetime, setDatetime] = useState(defaultDatetime);
  const [status, setStatus] = useState<ScheduleStatus>(schedule?.status ?? "planned");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const idea = sampleIdeas.find((item) => item.id === ideaId) ?? sampleIdeas[0];
  const account = sampleAccounts.find((item) => item.id === accountId) ?? sampleAccounts[0];

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!datetime) return;
    const scheduledAt = new Date(datetime).toISOString();
    onSave({
      id: schedule?.id ?? `sch-${Date.now()}`,
      ideaId: idea.id,
      ideaTitle: idea.title,
      accountId: account.id,
      accountName: account.name,
      platform: account.platform,
      scheduledAt,
      status,
    });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-modal-title"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.18 }}
          className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 id="schedule-modal-title" className="text-base font-bold text-[#2D2B55]">
              {schedule ? "投稿予定の編集" : "投稿予定の追加"}
            </h2>
            <button
              type="button"
              aria-label="閉じる"
              onClick={onClose}
              className="text-[#6B6885] hover:text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] rounded p-1 transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="idea-select" className="block text-sm font-medium text-[#2D2B55] mb-1">
                ネタ
              </label>
              <select
                id="idea-select"
                value={ideaId}
                onChange={(event) => setIdeaId(event.target.value)}
                className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
              >
                {sampleIdeas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="account-select" className="block text-sm font-medium text-[#2D2B55] mb-1">
                アカウント
              </label>
              <select
                id="account-select"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
              >
                {sampleAccounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}（{item.platform}）
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="datetime-input" className="block text-sm font-medium text-[#2D2B55] mb-1">
                投稿日時
              </label>
              <input
                id="datetime-input"
                type="datetime-local"
                value={datetime}
                onChange={(event) => setDatetime(event.target.value)}
                required
                className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
              />
            </div>

            <div>
              <label htmlFor="status-select" className="block text-sm font-medium text-[#2D2B55] mb-1">
                ステータス
              </label>
              <select
                id="status-select"
                value={status}
                onChange={(event) => setStatus(event.target.value as ScheduleStatus)}
                className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
              >
                <option value="planned">予定</option>
                <option value="published">公開済み</option>
                <option value="cancelled">中止</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              {schedule ? (
                confirmingDelete ? (
                  <div className="flex items-center gap-2 text-xs text-[#EF4444]">
                    <AlertTriangleIcon className="w-4 h-4" />
                    <span>本当に削除しますか？</span>
                    <button
                      type="button"
                      onClick={() => onDelete(schedule.id)}
                      className="font-semibold underline hover:text-[#DC2626]"
                    >
                      削除する
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="text-[#6B6885] underline"
                    >
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="flex items-center gap-1.5 text-sm font-medium text-[#EF4444] hover:text-[#DC2626] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#EF4444] rounded px-2 py-1 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                    削除
                  </button>
                )
              ) : (
                <span />
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-[#2D2B55] border border-[#E8E6F0] hover:border-[#7C3AED] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#7C3AED] hover:bg-[#6D28D9] shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
                >
                  {schedule ? "更新" : "追加"}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
