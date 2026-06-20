import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { type ItemType } from "@/generated/prisma/client";
import { jstNowLabel } from "@/lib/jst";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystemPrompt(nowLabel: string) {
  return `あなたはユーザーの入力テキストを分類するアシスタントです。
現在の日時（JST）: ${nowLabel}

以下のルールに従って入力を分析し、JSONのみで返答してください（コードブロック不要）。

分類カテゴリー:
- EVENT: 日時が決まっている予定・イベント
- TASK: やるべきタスク（期限なし）
- DEADLINE_TASK: 期限付きのタスク
- NOTE: メモ・覚書
- IDEA: アイデア・着想

日付の解釈はすべてJST（UTC+9）で行い、「明日」「来週」「今月末」などは現在のJST日時を基準にしてください。
日時はJSTオフセット付きISO 8601形式（例: 2026-06-21T14:00:00+09:00）で返してください。

返答は必ず以下のJSON形式のみ:
{
  "type": "EVENT" | "TASK" | "DEADLINE_TASK" | "NOTE" | "IDEA",
  "title": "簡潔なタイトル（30文字以内）",
  "content": "補足説明（任意、省略可）",
  "startAt": "JSTオフセット付きISO 8601（EVENTの開始時刻、任意）",
  "endAt": "JSTオフセット付きISO 8601（EVENTの終了時刻、任意）",
  "deadlineAt": "JSTオフセット付きISO 8601（DEADLINE_TASKの期限、任意）"
}`;
}

async function getAuthUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rawInput } = (await request.json()) as { rawInput?: string };
    if (!rawInput || rawInput.trim() === "") {
      return Response.json({ error: "rawInput is required" }, { status: 400 });
    }

    const dbUser = await prisma.user.upsert({
      where: { id: authUser.id },
      update: { email: authUser.email ?? "" },
      create: { id: authUser.id, email: authUser.email ?? "" },
    });

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: buildSystemPrompt(jstNowLabel()),
      messages: [{ role: "user", content: rawInput.trim() }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";

    let classified: {
      type: ItemType;
      title: string;
      content?: string;
      startAt?: string;
      endAt?: string;
      deadlineAt?: string;
    };
    try {
      const jsonText = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      classified = JSON.parse(jsonText);
    } catch {
      classified = { type: "NOTE", title: rawInput.slice(0, 30) };
    }

    const item = await prisma.item.create({
      data: {
        userId: dbUser.id,
        rawInput: rawInput.trim(),
        type: classified.type ?? "NOTE",
        title: classified.title ?? rawInput.slice(0, 30),
        content: classified.content ?? null,
        startAt: classified.startAt ? new Date(classified.startAt) : null,
        endAt: classified.endAt ? new Date(classified.endAt) : null,
        deadlineAt: classified.deadlineAt
          ? new Date(classified.deadlineAt)
          : null,
      },
    });

    return Response.json(item, { status: 201 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.item.findMany({
      where: { userId: authUser.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return Response.json(items);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
