"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloseIcon } from "@/components/icons";
import type { Revenue, RevenueFormValues, RevenueSourceType } from "@/components/revenue/types";
import { SOURCE_TYPE_LABELS } from "@/components/revenue/types";

interface RevenueFormModalProps {
  open: boolean;
  initialValues: Revenue | null;
  onSubmit: (values: RevenueFormValues) => void;
  onClose: () => void;
}

const SOURCE_TYPE_OPTIONS: RevenueSourceType[] = ["ad_revenue", "affiliate", "sponsorship", "other"];

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM: RevenueFormValues = {
  sourceType: "ad_revenue",
  amount: 0,
  expense: 0,
  recordDate: todayString(),
  memo: "",
};

/** 収益レコードの新規追加・編集を行うモーダルフォーム。 */
export function RevenueFormModal({ open, initialValues, onSubmit, onClose }: RevenueFormModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <RevenueFormModalContent
          key={initialValues?.id ?? "new"}
          initialValues={initialValues}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      )}
    </AnimatePresence>
  );
}

interface RevenueFormModalContentProps {
  initialValues: Revenue | null;
  onSubmit: (values: RevenueFormValues) => void;
  onClose: () => void;
}

/** モーダルが開くたびに再マウントされ、初期値からフォーム状態を組み立てる。 */
function RevenueFormModalContent({ initialValues, onSubmit, onClose }: RevenueFormModalContentProps) {
  const [form, setForm] = useState<RevenueFormValues>(
    initialValues
      ? {
          sourceType: initialValues.sourceType,
          amount: initialValues.amount,
          expense: initialValues.expense,
          recordDate: initialValues.recordDate,
          memo: initialValues.memo,
        }
      : EMPTY_FORM
  );
  const [dateError, setDateError] = useState<string | null>(null);

  const isEdit = initialValues !== null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.recordDate) {
      setDateError("日付を入力してください。");
      return;
    }
    onSubmit({ ...form, memo: form.memo.trim() });
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
      aria-labelledby="revenue-form-title"
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
          <h2 id="revenue-form-title" className="text-lg font-bold text-[#2D2B55]">
            {isEdit ? "収益レコードを編集" : "収益レコードを追加"}
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
            <label htmlFor="revenue-source-type" className="block text-sm font-semibold text-[#2D2B55] mb-1.5">
              収益源タイプ
            </label>
            <select
              id="revenue-source-type"
              value={form.sourceType}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sourceType: event.target.value as RevenueSourceType }))
              }
              className="w-full rounded-lg border border-[#E8E6F0] bg-white px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED]"
            >
              {SOURCE_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {SOURCE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="revenue-amount" className="block text-sm font-semibold text-[#2D2B55] mb-1.5">
                金額（円）
              </label>
              <input
                id="revenue-amount"
                type="number"
                min={0}
                value={form.amount}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, amount: Number(event.target.value) }))
                }
                className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED]"
              />
            </div>
            <div>
              <label htmlFor="revenue-expense" className="block text-sm font-semibold text-[#2D2B55] mb-1.5">
                経費（円）
              </label>
              <input
                id="revenue-expense"
                type="number"
                min={0}
                value={form.expense}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, expense: Number(event.target.value) }))
                }
                className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="revenue-date" className="block text-sm font-semibold text-[#2D2B55] mb-1.5">
              日付
            </label>
            <input
              id="revenue-date"
              type="date"
              value={form.recordDate}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, recordDate: event.target.value }));
                if (dateError) setDateError(null);
              }}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] ${
                dateError ? "border-[#EF4444]" : "border-[#E8E6F0]"
              }`}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={dateError ? "revenue-date-error" : undefined}
            />
            {dateError && (
              <p id="revenue-date-error" className="mt-1 text-xs text-[#EF4444]">
                {dateError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="revenue-memo" className="block text-sm font-semibold text-[#2D2B55] mb-1.5">
              メモ
            </label>
            <textarea
              id="revenue-memo"
              value={form.memo}
              onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
              rows={3}
              placeholder="収益の詳細や取引先などを入力"
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
