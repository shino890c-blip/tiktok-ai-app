"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangleIcon } from "@/components/icons";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "accent" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

/** 破壊的操作・承認操作の前に表示する確認ダイアログ。 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "キャンセル",
  variant = "accent",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  variant === "danger" ? "bg-[#FEE2E2] text-[#EF4444]" : "bg-[#F3F0FF] text-[#7C3AED]"
                }`}
              >
                <AlertTriangleIcon className="w-5 h-5" />
              </div>
              <h2 id="confirm-dialog-title" className="text-base font-bold text-[#2D2B55]">
                {title}
              </h2>
            </div>
            <p className="mt-3 text-sm text-[#6B6885] leading-relaxed">{description}</p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-[#2D2B55] border border-[#E8E6F0] hover:border-[#7C3AED] hover:text-[#7C3AED] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors ${
                  variant === "danger"
                    ? "bg-[#EF4444] hover:bg-[#DC2626]"
                    : "bg-[#7C3AED] hover:bg-[#6D28D9]"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
