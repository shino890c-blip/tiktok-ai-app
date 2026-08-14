"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloseIcon } from "@/components/icons";
import type { Account, AccountFormValues, Platform } from "@/components/accounts/types";
import { PLATFORM_LABELS } from "@/components/accounts/types";

interface AccountFormModalProps {
  open: boolean;
  initialValues: Account | null;
  onSubmit: (values: AccountFormValues) => void;
  onClose: () => void;
}

const PLATFORM_OPTIONS: Platform[] = ["tiktok", "youtube", "instagram", "twitter", "note"];

const EMPTY_FORM: AccountFormValues = { platform: "tiktok", name: "", memo: "" };

/** アカウントの新規追加・編集を行うモーダルフォーム。 */
export function AccountFormModal({ open, initialValues, onSubmit, onClose }: AccountFormModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <AccountFormModalContent
          key={initialValues?.id ?? "new"}
          initialValues={initialValues}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      )}
    </AnimatePresence>
  );
}

interface AccountFormModalContentProps {
  initialValues: Account | null;
  onSubmit: (values: AccountFormValues) => void;
  onClose: () => void;
}

/** モーダルが開くたびに再マウントされ、初期値からフォーム状態を組み立てる。 */
function AccountFormModalContent({ initialValues, onSubmit, onClose }: AccountFormModalContentProps) {
  const [form, setForm] = useState<AccountFormValues>(
    initialValues
      ? { platform: initialValues.platform, name: initialValues.name, memo: initialValues.memo }
      : EMPTY_FORM
  );
  const [nameError, setNameError] = useState<string | null>(null);

  const isEdit = initialValues !== null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setNameError("アカウント名を入力してください。");
      return;
    }
    onSubmit({ ...form, name: form.name.trim(), memo: form.memo.trim() });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-form-title"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="account-form-title" className="text-lg font-bold text-[#2D2B55]">
            {isEdit ? "アカウントを編集" : "アカウントを追加"}
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

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="account-platform" className="block text-sm font-semibold text-[#2D2B55] mb-1.5">
              プラットフォーム
            </label>
            <select
              id="account-platform"
              value={form.platform}
              onChange={(event) => setForm((prev) => ({ ...prev, platform: event.target.value as Platform }))}
              className="w-full rounded-lg border border-[#E8E6F0] bg-white px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED]"
            >
              {PLATFORM_OPTIONS.map((platform) => (
                <option key={platform} value={platform}>
                  {PLATFORM_LABELS[platform]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="account-name" className="block text-sm font-semibold text-[#2D2B55] mb-1.5">
              アカウント名
            </label>
            <input
              id="account-name"
              type="text"
              value={form.name}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, name: event.target.value }));
                if (nameError) setNameError(null);
              }}
              placeholder="例: @nightdrive_music"
              className={`w-full rounded-lg border px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] ${
                nameError ? "border-[#EF4444]" : "border-[#E8E6F0]"
              }`}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "account-name-error" : undefined}
            />
            {nameError && (
              <p id="account-name-error" className="mt-1 text-xs text-[#EF4444]">
                {nameError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="account-memo" className="block text-sm font-semibold text-[#2D2B55] mb-1.5">
              メモ
            </label>
            <textarea
              id="account-memo"
              value={form.memo}
              onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
              rows={3}
              placeholder="運用方針や特徴などを入力"
              className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
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
              {isEdit ? "保存する" : "追加する"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
