"use client";

import { useState } from "react";
import { CheckCircleIcon, XCircleIcon, UploadIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { RegistrationStatus } from "./types";

interface VideoRegistrationProps {
  videoUrl: string;
  status: RegistrationStatus;
  onVideoUrlChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}

/** 完成動画登録セクション：動画URLの入力と承認/却下操作 */
export function VideoRegistration({
  videoUrl,
  status,
  onVideoUrlChange,
  onApprove,
  onReject,
}: VideoRegistrationProps) {
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);
  const isValidUrl = videoUrl.trim().length > 0;

  const handleConfirm = () => {
    if (confirmAction === "approve") {
      onApprove();
    } else if (confirmAction === "reject") {
      onReject();
    }
    setConfirmAction(null);
  };

  return (
    <section aria-labelledby="video-registration-title" className="bg-white rounded-xl border border-[#E8E6F0] p-5 sm:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <UploadIcon className="w-5 h-5 text-[#7C3AED]" />
        <h2 id="video-registration-title" className="text-lg font-bold text-[#2D2B55]">
          完成動画登録
        </h2>
      </div>

      <label htmlFor="video-url" className="text-sm font-semibold text-[#2D2B55] mb-2 block">
        動画URL
      </label>
      <input
        id="video-url"
        type="url"
        value={videoUrl}
        onChange={(event) => onVideoUrlChange(event.target.value)}
        placeholder="https://..."
        className="w-full rounded-lg border border-[#E8E6F0] px-4 py-2.5 text-sm text-[#2D2B55] placeholder:text-[#A8A5BD] focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20 transition-colors"
      />

      <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <button
          type="button"
          onClick={() => setConfirmAction("approve")}
          disabled={!isValidUrl}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 disabled:hover:bg-[#7C3AED] text-white text-sm font-bold rounded-lg shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2D2B55] transition-colors"
        >
          <CheckCircleIcon className="w-4 h-4" />
          承認して登録
        </button>
        <button
          type="button"
          onClick={() => setConfirmAction("reject")}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-white text-[#2D2B55] border border-[#E8E6F0] hover:border-[#EF4444] hover:text-[#EF4444] text-sm font-semibold rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors"
        >
          <XCircleIcon className="w-4 h-4" />
          却下
        </button>
      </div>

      {status === "approved" && (
        <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-[#22C55E]">
          <CheckCircleIcon className="w-4 h-4" />
          動画を承認し、登録しました。
        </p>
      )}
      {status === "rejected" && (
        <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-[#EF4444]">
          <XCircleIcon className="w-4 h-4" />
          動画を却下しました。再生成を検討してください。
        </p>
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === "approve" ? "動画を承認しますか？" : "動画を却下しますか？"}
        description={
          confirmAction === "approve"
            ? "この動画を完成版として登録します。登録後は制作ボードに反映されます。"
            : "この動画を却下します。台本の見直しや素材の再生成が必要になる場合があります。"
        }
        confirmLabel={confirmAction === "approve" ? "承認する" : "却下する"}
        variant={confirmAction === "approve" ? "accent" : "danger"}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </section>
  );
}
