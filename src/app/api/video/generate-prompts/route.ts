import { NextRequest, NextResponse } from "next/server";
import { getVideoGenerator } from "@/lib/video-generator";
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

  try {
    const generator = getVideoGenerator();
    const result = await generator.generatePrompts({ script: validated.script });

    return NextResponse.json({
      provider: generator.providerName,
      isMock: result.isMock,
      scenes: result.scenes,
    });
  } catch {
    return NextResponse.json(
      { error: "映像プロンプトの生成中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}
