import { NextRequest, NextResponse } from "next/server";
import { getVideoGenerator } from "@/lib/video-generator";
import { generateSubtitles } from "@/lib/video-generator/subtitles";
import { validateScript } from "@/lib/video-generator/validate";
import type { ScenePrompt } from "@/lib/video-generator/types";

type StepStatus = "success" | "error";

interface StepResult {
  step: "prompts" | "voice" | "subtitles";
  status: StepStatus;
  message?: string;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディのJSON解析に失敗しました。" },
      { status: 400 }
    );
  }

  const validated = validateScript(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const script = validated.script;
  const id =
    typeof (body as Record<string, unknown>)?.id === "string"
      ? ((body as Record<string, unknown>).id as string)
      : `job-${Date.now()}`;

  const generator = getVideoGenerator();
  const steps: StepResult[] = [];

  // 1. 映像プロンプト生成
  let scenes: ScenePrompt[] = [];
  let promptsIsMock = true;
  try {
    const promptsResult = await generator.generatePrompts({ script });
    scenes = promptsResult.scenes;
    promptsIsMock = promptsResult.isMock;
    steps.push({ step: "prompts", status: "success" });
  } catch {
    steps.push({
      step: "prompts",
      status: "error",
      message: "映像プロンプトの生成に失敗しました。",
    });
  }

  // 2. ナレーション音声生成
  let audioUrl: string | null = null;
  let voiceIsMock = true;
  try {
    const voiceResult = await generator.generateVoice({ script, id });
    audioUrl = voiceResult.audioUrl;
    voiceIsMock = voiceResult.isMock;
    steps.push({ step: "voice", status: "success" });
  } catch {
    steps.push({
      step: "voice",
      status: "error",
      message: "ナレーション音声の生成に失敗しました。",
    });
  }

  // 3. 字幕ファイル生成
  let subtitleUrl: string | null = null;
  try {
    const subtitlesResult = await generateSubtitles({ script, id });
    subtitleUrl = subtitlesResult.subtitleUrl;
    steps.push({ step: "subtitles", status: "success" });
  } catch {
    steps.push({
      step: "subtitles",
      status: "error",
      message: "字幕ファイルの生成に失敗しました。",
    });
  }

  const hasError = steps.some((step) => step.status === "error");

  return NextResponse.json(
    {
      jobId: id,
      provider: generator.providerName,
      steps,
      assets: {
        scenes,
        audioUrl,
        subtitleUrl,
      },
      isMock: promptsIsMock || voiceIsMock,
    },
    { status: hasError ? 207 : 200 }
  );
}
