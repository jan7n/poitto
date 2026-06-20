import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { jstNowLabel, fmtDateTime } from "@/lib/jst";
import type { ChatMessage } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MVP_USER_EMAIL = "poitto-dev@example.com";

export async function POST(request: Request) {
  try {
    const { message, history } = (await request.json()) as {
      message: string;
      history?: ChatMessage[];
    };

    const user = await prisma.user.findUnique({
      where: { email: MVP_USER_EMAIL },
    });

    let itemsContext = "（登録済みアイテムなし）";
    if (user) {
      const items = await prisma.item.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 200,
      });

      if (items.length > 0) {
        itemsContext = items
          .map((i) => {
            const parts = [`[${i.type}] ${i.title}`];
            if (i.startAt) parts.push(`開始: ${fmtDateTime(i.startAt)}`);
            if (i.endAt) parts.push(`終了: ${fmtDateTime(i.endAt)}`);
            if (i.deadlineAt) parts.push(`期限: ${fmtDateTime(i.deadlineAt)}`);
            if (i.completed) parts.push("✓完了");
            return parts.join(" | ");
          })
          .join("\n");
      }
    }

    const system = `あなたはユーザーの予定・タスク管理をサポートするAIアシスタントです。
現在の日時（JST）: ${jstNowLabel()}

ユーザーの登録済みアイテム:
${itemsContext}

上記のデータをもとに、ユーザーの質問に日本語で自然に答えてください。
- 日付・時刻はJST表示を使用
- 該当なしの場合は「〇〇はありません」と答える
- 箇条書きを適切に使い、読みやすく回答する
- 200文字程度で簡潔にまとめる`;

    const messages: Anthropic.MessageParam[] = [
      ...(history ?? []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system,
      messages,
    });

    const reply =
      response.content[0].type === "text" ? response.content[0].text : "";
    return Response.json({ reply });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
