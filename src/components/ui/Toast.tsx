"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircleIcon } from "@/components/icons";

interface ToastProps {
  message: string | null;
}

/** 画面右下に一時的に表示する成功トースト。 */
export function Toast({ message }: ToastProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            role="status"
            className="flex items-center gap-2 rounded-lg bg-[#2D2B55] px-4 py-3 text-sm font-medium text-white shadow-xl"
          >
            <CheckCircleIcon className="w-4 h-4 text-[#22C55E]" />
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
