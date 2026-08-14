"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloseIcon } from "@/components/icons";
import { GENRES } from "@/components/ideas/types";
import type { IdeaFormValues } from "@/components/ideas/types";

interface IdeaFormModalProps {
  open: boolean;
  onSubmit: (values: IdeaFormValues) => void;
  onClose: () => void;
}

const EMPTY_FORM: IdeaFormValues = { title: "", description: "", genre: GENRES[0] };

/** ネタの新規追加を行うモーダルフォーム。 */
export function IdeaFormModal({ open, onSubmit, onClose }: IdeaFormModalProps) {
  return (
    <AnimatePresence>
      {open && <IdeaFormModalContent onSubmit={onSubmit} onClose={onClose} />}
    </AnimatePresence>
  );
}

interface IdeaFormModalContentProps {
  onSubmit: (values: IdeaFormValues) => void;
  onClose: () => void;
}

/** モーダルが開くたびに再マウントされ、初期状態からフォームを組み立てる。 */
function IdeaFormModalContent({ onSubmit, onClose }: IdeaFormModalContentProps) {
  const [form, setForm] = useState<IdeaFormValues>(EMPTY_FORM);
  const [titleError, setTitleError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setTitleError("タイトルを入力してください。");
      return;
    }
    onSubmit({ ...form, title: form.title.trim(), description: form.description.trim() });
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
      aria-labelledby="idea-form-title"
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
          <h2 id="idea-form-title" className="text-lg font-bold text-[#2D2B55]">
            新規ネタを追加
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
            <label htmlFor="idea-title" className="block text-sm font-semibold text-[#2D2B55] mb-1.5">
              タイトル
            </label>
            <input
              id="idea-title"
              type="text"
              value={form.title}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, title: event.target.value }));
                if (titleError) setTitleError(null);
              }}
              placeholder="例: 深夜のドライブで聴きたい曲"
              className={`w-full rounded-lg border px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] ${
                titleError ? "border-[#EF4444]" : "border-[#E8E6F0]"
              }`}
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? "idea-title-error" : undefined}
            />
            {titleError && (
              <p id="idea-title-error" className="mt-1 text-xs text-[#EF4444]">
                {titleError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="idea-genre" className="block text-sm font-semibold text-[#2D2B55] mb-1.5">
              ジャンル
            </label>
            <select
              id="idea-genre"
              value={form.genre}
              onChange={(event) => setForm((prev) => ({ ...prev, genre: event.target.value }))}
              className="w-full rounded-lg border border-[#E8E6F0] bg-white px-3 py-2 text-sm text-[#2D2B55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED]"
            >
              {GENRES.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="idea-description" className="block text-sm font-semibold text-[#2D2B55] mb-1.5">
              概要・メモ
            </label>
            <textarea
              id="idea-description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={3}
              placeholder="企画の概要や参考情報を入力"
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
              追加する
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
