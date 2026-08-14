import { NextRequest, NextResponse } from "next/server";
import { getNotePublisher } from "@/lib/note-publisher";

function parseHashtags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((tag): tag is string => typeof tag === "string");
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "リクエストボディのJSON解析に失敗しました。" },
      { status: 400 }
    );
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const title = typeof record.title === "string" ? record.title : "";
  const articleBody = typeof record.body === "string" ? record.body : "";
  const hashtags = parseHashtags(record.hashtags);

  if (!title.trim() || !articleBody.trim()) {
    return NextResponse.json(
      { success: false, error: "タイトルと本文は必須です。" },
      { status: 400 }
    );
  }

  const publisher = getNotePublisher();

  try {
    const result = await publisher.publishDraft({ title, body: articleBody, hashtags });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { success: true, draftUrl: result.draftUrl },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "下書き保存中に予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}
