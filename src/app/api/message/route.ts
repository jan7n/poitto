import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import {
  jstNow,
  jstNowLabel,
  toJSTKey,
  fmtTime,
  fmtDateTime,
  parseAsJST,
} from "@/lib/jst";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SEP = "---DATA---";

function buildUpcomingSchedule(
  items: Array<{ type: string; title: string; startAt: Date | null; endAt: Date | null }>,
  days = 14
): string {
  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const jst = jstNow();

  const byDay: Record<string, string[]> = {};
  for (const item of items) {
    if (item.type !== "EVENT" || !item.startAt) continue;
    const key = toJSTKey(item.startAt);
    if (!byDay[key]) byDay[key] = [];
    const s = fmtTime(item.startAt);
    const e = item.endAt ? ` 〜 ${fmtTime(item.endAt)}` : "";
    byDay[key].push(`${item.title}（${s}${e}）`);
  }

  const lines: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(
      Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + i)
    );
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const wd = WEEKDAYS[d.getUTCDay()];
    const label = `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${wd}）`;
    const evts = byDay[key];
    lines.push(evts?.length ? `${label}: ${evts.join(" / ")}` : `${label}: 予定なし`);
  }

  return lines.join("\n");
}

function buildSystem(
  nowLabel: string,
  itemsCtx: string,
  lastCtx: string,
  upcomingSchedule: string
) {
  return `あなたは「ポイッと」アプリのAIアシスタントです。
現在の日時（JST）: ${nowLabel}

ユーザーのメッセージを以下4種類に分類し、指定の形式で返答してください。

## 分類の基準:
- register: 新しい予定・タスク・メモ・アイデアを新規作成（「〇〇がある」「〇〇しなきゃ」等）
- edit: 既存アイテムを更新（「〇〇に変えて」「修正して」等）
- delete: 既存アイテムを削除（「消して」「削除して」等）
- query: 登録済みデータへの質問（「〇〇は？」「空き時間は？」等）

## 登録済みアイテム（IDと内容）:
${itemsCtx}

## 直近14日間のスケジュール（空き時間計算用）:
${upcomingSchedule}

## 直前に操作したアイテム（「さっき」「直前の」「最後に登録した」の基準）:
${lastCtx}

## 空き時間の質問への回答ルール（「いつ空いてる？」「ご飯行けそう」等）:
1. 対象期間を特定（今週・来週・今週末等）
2. 各日のEVENTから空き時間を計算
3. 「ご飯」「食事」「飲み」→ 18:00以降の枠のみ
4. フォーマット: 冒頭1行コメント、箇条書きリスト（日付・曜日・時間帯）

## 出力形式（必ずこの順序で出力）:
自然な日本語返答（1〜2文。時刻・日付を必ず含める）
${SEP}
JSON（1行、コードブロック不要）

## JSONスキーマ:
register: {"action":"register","itemData":{"type":"EVENT"|"TASK"|"DEADLINE_TASK"|"NOTE"|"IDEA","title":"30文字以内","content":"省略可","startAt":"YYYY-MM-DDThh:mm:00+09:00","endAt":"省略可","deadlineAt":"省略可"}}
edit: {"action":"edit","targetId":"末尾8桁","updateData":{"title":"省略可","type":"省略可","content":"省略可","startAt":"変更後またはnull","endAt":"変更後またはnull","deadlineAt":"変更後またはnull"}}
delete: {"action":"delete","targetId":"末尾8桁"}
query: {"action":"query"}

## 出力例（登録）:
テニスを今日9時から登録しました。
${SEP}
{"action":"register","itemData":{"type":"EVENT","title":"テニス","startAt":"2026-06-20T09:00:00+09:00"}}

## 出力例（質問）:
明日は14時からミーティングがあります。
${SEP}
{"action":"query"}

## 注意:
- 「さっき」「直前」「最後に」→ 直前に操作したアイテムのIDをtargetIdに使う
- 日時はJST（UTC+9）オフセット付きISO 8601形式
- 「明日」「来週末」等は現在のJST日時基準で解釈`;
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
        );
      };

      try {
        // Safari buffers until 1024 bytes — send a comment to flush immediately
        controller.enqueue(
          encoder.encode(`: ${"x".repeat(1016)}\n\n`)
        );

        const supabase = await createSupabaseServerClient();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (!authUser) {
          send({ t: "error", message: "認証エラーです。" });
          return;
        }

        const { message, history, lastItemId } = (await request.json()) as {
          message: string;
          history?: { role: "user" | "assistant"; content: string }[];
          lastItemId?: string | null;
        };

        let user = await prisma.user.findUnique({ where: { id: authUser.id } });
        if (!user) {
          user = await prisma.user.create({
            data: { id: authUser.id, email: authUser.email ?? "" },
          });
        }

        const items = await prisma.item.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 60,
          select: {
            id: true,
            type: true,
            title: true,
            startAt: true,
            endAt: true,
            deadlineAt: true,
            completed: true,
          },
        });

        const idMap = new Map(items.map((i) => [i.id.slice(-8), i.id]));

        const itemsCtx =
          items.length === 0
            ? "（まだ登録なし）"
            : items
                .map((i) => {
                  const parts = [`${i.id.slice(-8)} [${i.type}] ${i.title}`];
                  if (i.startAt) parts.push(`開始: ${fmtDateTime(i.startAt)}`);
                  if (i.endAt) parts.push(`終了: ${fmtDateTime(i.endAt)}`);
                  if (i.deadlineAt) parts.push(`期限: ${fmtDateTime(i.deadlineAt)}`);
                  if (i.completed) parts.push("✓完了");
                  return parts.join(" | ");
                })
                .join("\n");

        let lastCtx = "（なし）";
        if (lastItemId) {
          const last = items.find((i) => i.id === lastItemId);
          if (last) {
            const parts = [`ID末尾: ${last.id.slice(-8)} [${last.type}] ${last.title}`];
            if (last.startAt) parts.push(`開始: ${fmtDateTime(last.startAt)}`);
            if (last.deadlineAt) parts.push(`期限: ${fmtDateTime(last.deadlineAt)}`);
            lastCtx = parts.join(" | ");
          }
        }

        const upcomingSchedule = buildUpcomingSchedule(items);

        const msgs: Anthropic.MessageParam[] = [
          ...(history ?? []).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user", content: message },
        ];

        const claudeStream = anthropic.messages.stream({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: buildSystem(jstNowLabel(), itemsCtx, lastCtx, upcomingSchedule),
          messages: msgs,
        });

        let buffer = "";
        let cursor = 0;
        let sepAt = -1;

        for await (const event of claudeStream) {
          if (
            event.type !== "content_block_delta" ||
            event.delta.type !== "text_delta"
          ) continue;
          const text = event.delta.text;
          buffer += text;

          if (sepAt === -1) {
            const idx = buffer.indexOf(SEP);
            if (idx !== -1) {
              sepAt = idx;
              const replyPart = buffer.slice(cursor, sepAt).trimEnd();
              if (replyPart) send({ t: "chunk", v: replyPart });
              cursor = sepAt + SEP.length;
            } else {
              // Keep SEP.length-1 chars in reserve to detect separator across chunks
              const safeEnd = buffer.length - (SEP.length - 1);
              if (safeEnd > cursor) {
                send({ t: "chunk", v: buffer.slice(cursor, safeEnd) });
                cursor = safeEnd;
              }
            }
          }
        }

        // Determine reply and JSON parts
        let jsonStr = "";

        if (sepAt !== -1) {
          jsonStr = buffer.slice(sepAt + SEP.length).trim();
        } else {
          // Separator not found — try JSON fallback (graceful degradation)
          const cleaned = buffer
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/, "")
            .trim();
          try {
            const parsed = JSON.parse(cleaned) as { reply?: string; action?: string };
            if (parsed.reply && cursor === 0) {
              send({ t: "chunk", v: parsed.reply });
            }
            jsonStr = cleaned;
          } catch {
            const remaining = buffer.slice(cursor).trim();
            if (remaining) send({ t: "chunk", v: remaining });
            send({ t: "done", action: "query" });
            return;
          }
        }

        let result: {
          action: "register" | "edit" | "delete" | "query";
          targetId?: string;
          itemData?: {
            type: ItemType;
            title: string;
            content?: string;
            startAt?: string;
            endAt?: string;
            deadlineAt?: string;
          };
          updateData?: {
            type?: ItemType;
            title?: string;
            content?: string;
            startAt?: string | null;
            endAt?: string | null;
            deadlineAt?: string | null;
          };
        };

        try {
          result = JSON.parse(jsonStr);
        } catch {
          send({ t: "done", action: "query" });
          return;
        }

        function resolveId(shortId?: string): string | null {
          if (!shortId) return null;
          if (items.some((i) => i.id === shortId)) return shortId;
          return idMap.get(shortId) ?? null;
        }

        if (result.action === "register" && result.itemData) {
          const d = result.itemData;
          try {
            const item = await prisma.item.create({
              data: {
                userId: user.id,
                rawInput: message,
                type: d.type ?? "NOTE",
                title: d.title ?? message.slice(0, 30),
                content: d.content ?? null,
                startAt: parseAsJST(d.startAt),
                endAt: parseAsJST(d.endAt),
                deadlineAt: parseAsJST(d.deadlineAt),
              },
            });
            send({ t: "done", action: "register", item });
          } catch {
            send({ t: "done", action: "query" });
          }
          return;
        }

        if (result.action === "edit" && result.updateData) {
          const targetId = resolveId(result.targetId) ?? lastItemId;
          if (!targetId) {
            send({ t: "done", action: "query" });
            return;
          }
          const u = result.updateData;
          const patch: Record<string, unknown> = {};
          if (u.type !== undefined) patch.type = u.type;
          if (u.title !== undefined) patch.title = u.title;
          if ("content" in u) patch.content = u.content ?? null;
          if ("startAt" in u) patch.startAt = parseAsJST(u.startAt);
          if ("endAt" in u) patch.endAt = parseAsJST(u.endAt);
          if ("deadlineAt" in u) patch.deadlineAt = parseAsJST(u.deadlineAt);

          try {
            const item = await prisma.item.update({ where: { id: targetId }, data: patch });
            send({ t: "done", action: "edit", item });
          } catch {
            send({ t: "done", action: "query" });
          }
          return;
        }

        if (result.action === "delete") {
          const targetId = resolveId(result.targetId) ?? lastItemId;
          if (!targetId) {
            send({ t: "done", action: "query" });
            return;
          }
          try {
            await prisma.item.delete({ where: { id: targetId } });
            send({ t: "done", action: "delete", deletedId: targetId });
          } catch {
            send({ t: "done", action: "query" });
          }
          return;
        }

        send({ t: "done", action: "query" });
      } catch (err) {
        console.error(err);
        try {
          send({ t: "error", message: "エラーが発生しました。" });
        } catch {}
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
