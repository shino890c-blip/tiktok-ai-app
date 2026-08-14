import { NextRequest, NextResponse } from "next/server";
import { getNoteGenerator } from "@/lib/note-generator";
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

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const ideaId =
    typeof record.ideaId === "string" && record.ideaId.trim().length > 0
      ? record.ideaId
      : `idea-${Date.now()}`;

  const validated = validateScript(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const generator = getNoteGenerator();

  try {
    const result = await generator.generateArticle({ script: validated.script, ideaId });

    return NextResponse.json(
      {
        article: result.article,
        provider: generator.providerName,
        isMock: result.isMock,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "記事の生成中に予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}
