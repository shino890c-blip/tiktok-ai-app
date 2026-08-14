"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloseIcon } from "@/components/icons";
import { PRODUCTION_COLUMNS } from "./types";
import type { ProductionStatus } from "./types";

interface AddTaskModalProps {
  open: boolean;
  defaultStatus: ProductionStatus;
  onClose: () => void;
  onAdd: (input: { title: string; assigneeMemo: string; genre: string; status: ProductionStatus }) => void;
}

interface AddTaskFormProps {
  defaultStatus: ProductionStatus;
  onClose: () => void;
  onAdd: (input: { title: string; assigneeMemo: string; genre: string; status: ProductionStatus }) => void;
}

function AddTaskForm({ defaultStatus, onClose, onAdd }: AddTaskFormProps) {
  const titleId = useId();
  const [title, setTitle] = useState("");
  const [assigneeMemo, setAssigneeMemo] = useState("");
  const [genre, setGenre] = useState("");
  const [status, setStatus] = useState<ProductionStatus>(defaultStatus);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), assigneeMemo: assigneeMemo.trim(), genre: genre.trim(), status });
    onClose();
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
      aria-labelledby={titleId}
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
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="text-base font-bold text-[#2D2B55]">
            新規タスクを追加
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
            <label htmlFor="task-title" className="block text-sm font-medium text-[#2D2B55] mb-1">
              タイトル<span className="text-[#EF4444]">*</span>
            </label>
            <input
              id="task-title"
              type="text"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例: 猫のかわいい瞬間集 #4"
              className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
            />
          </div>

          <div>
            <label htmlFor="task-genre" className="block text-sm font-medium text-[#2D2B55] mb-1">
              ジャンル
            </label>
            <input
              id="task-genre"
              type="text"
              value={genre}
              onChange={(event) => setGenre(event.target.value)}
              placeholder="例: ペット・猫"
              className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
            />
          </div>

          <div>
            <label htmlFor="task-memo" className="block text-sm font-medium text-[#2D2B55] mb-1">
              担当メモ
            </label>
            <textarea
              id="task-memo"
              value={assigneeMemo}
              onChange={(event) => setAssigneeMemo(event.target.value)}
              placeholder="例: 鈴木: 素材選定中"
              rows={2}
              className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED] resize-none"
            />
          </div>

          <div>
            <label htmlFor="task-status" className="block text-sm font-medium text-[#2D2B55] mb-1">
              ステータス
            </label>
            <select
              id="task-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as ProductionStatus)}
              className="w-full rounded-lg border border-[#E8E6F0] px-3 py-2 text-sm text-[#2D2B55] focus:outline focus:outline-2 focus:outline-[#7C3AED]"
            >
              {PRODUCTION_COLUMNS.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.title}
                </option>
              ))}
            </select>
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

export function AddTaskModal({ open, defaultStatus, onClose, onAdd }: AddTaskModalProps) {
  return (
    <AnimatePresence>
      {open && <AddTaskForm defaultStatus={defaultStatus} onClose={onClose} onAdd={onAdd} />}
    </AnimatePresence>
  );
}
