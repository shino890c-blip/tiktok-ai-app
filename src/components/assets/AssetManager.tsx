"use client";

import { useState } from "react";
import { IdeaHeader } from "./IdeaHeader";
import { UrlField } from "./UrlField";
import { ImageUrlList } from "./ImageUrlList";
import { SubtitlePanel } from "./SubtitlePanel";
import { RightsApprovalPanel } from "./RightsApprovalPanel";
import { Toast } from "@/components/ui/Toast";
import type { Asset, IdeaSummary } from "./types";

interface AssetManagerProps {
  idea: IdeaSummary;
  initialAsset: Asset;
}

export function AssetManager({ idea, initialAsset }: AssetManagerProps) {
  const [asset, setAsset] = useState<Asset>(initialAsset);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2200);
  };

  const handleAddImageUrl = (url: string) => {
    setAsset((prev) => ({ ...prev, imageUrls: [...prev.imageUrls, url] }));
  };

  const handleRemoveImageUrl = (index: number) => {
    setAsset((prev) => ({ ...prev, imageUrls: prev.imageUrls.filter((_, i) => i !== index) }));
  };

  const handleToggleRights = () => {
    setAsset((prev) => ({ ...prev, rightsChecked: !prev.rightsChecked }));
  };

  const handleApprove = () => {
    if (!asset.rightsChecked || asset.isApproved) return;
    setAsset((prev) => ({
      ...prev,
      isApproved: true,
      approvedAt: new Date().toISOString(),
    }));
    showToast("素材を承認しました");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <IdeaHeader idea={idea} />

      <section className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-[#2D2B55]">メディアURL</h3>
        <UrlField
          label="動画URL"
          value={asset.videoUrl}
          placeholder="https://example.com/video.mp4"
          onChange={(value) => setAsset((prev) => ({ ...prev, videoUrl: value || null }))}
        />
        <UrlField
          label="サムネイルURL"
          value={asset.thumbnailUrl}
          placeholder="https://example.com/thumbnail.jpg"
          onChange={(value) => setAsset((prev) => ({ ...prev, thumbnailUrl: value || null }))}
        />
        <UrlField
          label="音声URL"
          value={asset.audioUrl}
          placeholder="https://example.com/audio.mp3"
          onChange={(value) => setAsset((prev) => ({ ...prev, audioUrl: value || null }))}
        />
      </section>

      <section className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm">
        <ImageUrlList
          imageUrls={asset.imageUrls}
          onAdd={handleAddImageUrl}
          onRemove={handleRemoveImageUrl}
        />
      </section>

      <section className="bg-white rounded-xl border border-[#E8E6F0] p-5 shadow-sm">
        <SubtitlePanel subtitleText={asset.subtitleText} />
      </section>

      <RightsApprovalPanel
        rightsChecked={asset.rightsChecked}
        isApproved={asset.isApproved}
        approvedAt={asset.approvedAt}
        onToggleRights={handleToggleRights}
        onApprove={handleApprove}
      />

      <Toast message={toastMessage} />
    </div>
  );
}
