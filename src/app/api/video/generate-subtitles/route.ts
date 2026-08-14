import { NextRequest, NextResponse } from "next/server";
import { generateSubtitles } from "@/lib/video-generator/subtitles";
import { validateScript } from "@/lib/video-generator/validate";

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

  const id =
    typeof (body as Record<string, unknown>)?.id === "string"
      ? ((body as Record<string, unknown>).id as string)
      : undefined;

  try {
    const result = await generateSubtitles({ script: validated.script, id });

    return NextResponse.json({
      subtitleUrl: result.subtitleUrl,
      srtContent: result.srtContent,
    });
  } catch {
    return NextResponse.json(
      { error: "字幕ファイルの生成中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}
