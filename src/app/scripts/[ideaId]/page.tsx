"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { ScriptEditor } from "@/components/scripts/ScriptEditor";
import { AssetGenerator } from "@/components/scripts/AssetGenerator";
import { GensparkGuide } from "@/components/scripts/GensparkGuide";
import { VideoRegistration } from "@/components/scripts/VideoRegistration";
import { Toast } from "@/components/ui/Toast";
import { getScripts } from "@/lib/data/scripts";
import type {
  GenerateAllResponse,
  GenerationStep,
  RegistrationStatus,
  StructureRow,
} from "@/components/scripts/types";
import type { Script } from "@/lib/video-generator/types";

const INITIAL_STRUCTURE: StructureRow[] = [
  { uid: "row-1", time: "0-5秒", content: "" },
];

const INITIAL_STEPS: GenerationStep[] = [
  { id: "prompts", label: "映像プロンプトを生成中", status: "pending" },
  { id: "voice", label: "ナレーション音声を生成中", status: "pending" },
  { id: "subtitles", label: "字幕ファイルを生成中", status: "pending" },
];

function createRowId(): string {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ScriptPage(props: PageProps<"/scripts/[ideaId]">) {
  const { ideaId } = use(props.params);

  const [hook, setHook] = useState("");
  const [narration, setNarration] = useState("");
  const [structure, setStructure] = useState<StructureRow[]>(INITIAL_STRUCTURE);
  const [videoPrompt, setVideoPrompt] = useState("");
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [steps, setSteps] = useState<GenerationStep[]>(INITIAL_STEPS);
  const [generateResult, setGenerateResult] = useState<GenerateAllResponse | null>(null);
  const [srtContent, setSrtContent] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus>("idle");

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getScripts(ideaId)
      .then((records) => {
        if (cancelled) return;
        const latest = records[0];
        if (latest) {
          setHook(latest.hook);
          setNarration(latest.narration);
          setStructure(
            latest.structure.length > 0
              ? latest.structure.map((item) => ({ uid: createRowId(), ...item }))
              : INITIAL_STRUCTURE
          );
          setVideoPrompt(latest.videoPrompt);
          setRegistrationStatus(latest.isApproved ? "approved" : "idle");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("台本の取得に失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ideaId]);

  const handleStructureChange = (uid: string, field: "time" | "content", value: string) => {
    setStructure((prev) =>
      prev.map((row) => (row.uid === uid ? { ...row, [field]: value } : row))
    );
  };

  const handleStructureAdd = () => {
    setStructure((prev) => [...prev, { uid: createRowId(), time: "", content: "" }]);
  };

  const handleStructureRemove = (uid: string) => {
    setStructure((prev) => (prev.length > 1 ? prev.filter((row) => row.uid !== uid) : prev));
  };

  const handleSaveScript = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const buildScript = (): Script => ({
    hook,
    narration,
    structure: structure.map(({ time, content }) => ({ time, content })),
    video_prompt: videoPrompt,
  });

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);
    setSrtContent(null);
    setSteps(INITIAL_STEPS.map((step, index) => ({ ...step, status: index === 0 ? "in_progress" : "pending" })));

    try {
      const response = await fetch("/api/video/generate-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ideaId, script: buildScript() }),
      });

      const data = (await response.json()) as GenerateAllResponse & { error?: string };

      if (!response.ok && response.status !== 207) {
        setGenerateError(data.error ?? "素材の自動生成に失敗しました。");
        setSteps(INITIAL_STEPS);
        return;
      }

      setSteps(
        INITIAL_STEPS.map((defaultStep) => {
          const matched = data.steps.find((step) => step.step === defaultStep.id);
          return {
            ...defaultStep,
            status: matched?.status ?? "error",
            message: matched?.message,
          };
        })
      );
      setGenerateResult(data);

      if (data.assets.subtitleUrl) {
        try {
          const srtResponse = await fetch(data.assets.subtitleUrl);
          if (srtResponse.ok) {
            setSrtContent(await srtResponse.text());
          }
        } catch {
          setSrtContent(null);
        }
      }
    } catch {
      setGenerateError("素材の自動生成中にネットワークエラーが発生しました。");
      setSteps(INITIAL_STEPS);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPrompt = () => {
    showToast("コピーしました");
  };

  const handleApprove = () => {
    setRegistrationStatus("approved");
  };

  const handleReject = () => {
    setRegistrationStatus("rejected");
  };

  return (
    <div className="min-h-screen bg-[#F8F7FA] flex">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-[#E8E6F0] px-4 pl-14 sm:pl-16 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-[#2D2B55]">台本作成</h1>
          <p className="text-sm text-[#6B6885] mt-1">
            ネタID: <span className="font-mono">{ideaId}</span> の台本を作成し、動画制作素材を自動生成します。
          </p>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl">
          {loadError && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#E8E6F0] bg-white py-16 text-center shadow-sm">
              <p className="text-sm text-[#6B6885]">読み込み中...</p>
            </div>
          ) : (
            <ScriptEditor
              hook={hook}
              narration={narration}
              structure={structure}
              videoPrompt={videoPrompt}
              saved={saved}
              onHookChange={setHook}
              onNarrationChange={setNarration}
              onVideoPromptChange={setVideoPrompt}
              onStructureChange={handleStructureChange}
              onStructureAdd={handleStructureAdd}
              onStructureRemove={handleStructureRemove}
              onSave={handleSaveScript}
            />
          )}

          <AssetGenerator
            isGenerating={isGenerating}
            steps={steps}
            result={generateResult}
            srtContent={srtContent}
            errorMessage={generateError}
            onGenerate={handleGenerate}
            onCopyPrompt={handleCopyPrompt}
          />

          <GensparkGuide />

          <VideoRegistration
            videoUrl={videoUrl}
            status={registrationStatus}
            onVideoUrlChange={setVideoUrl}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </div>
      </main>

      <Toast message={toastMessage} />
    </div>
  );
}
