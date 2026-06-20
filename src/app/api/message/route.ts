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

interface PendingItem {
  type: string;
  title: string;
  content?: string;
}

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
  upcomingSchedule: string,
  pendingItem?: PendingItem | null
) {
  const pendingSection = pendingItem
    ? `## ⚠️ 最優先タスク: 期限を登録してください
ユーザーは「${pendingItem.title}」の期限を回答しています。
ユーザーのメッセージから期限日時を解析し、必ず以下の形式でJSONを出力してください。

【必須】action と itemData の両方を正確に出力すること:
- action: "register"
- itemData.type: "DEADLINE_TASK"（他の値は不可）
- itemData.title: "${pendingItem.title}"
- itemData.deadlineAt: ユーザーが述べた日時をJST（+09:00）オフセット付きISO 8601で（必須、絶対省略しない）
  - 「明日」→ 現在のJST日時の翌日23:59:00+09:00
  - 「今週金曜」→ その週の金曜23:59:00+09:00
  - 「来週月曜の朝」→ 来週月曜09:00:00+09:00
  - 時刻が不明な場合は23:59:00にすること

期限が全く読み取れない場合（「やめる」「やっぱりいい」等）のみ action:"query" を使用。

`
    : "";

  return `あなたは「ポイッと」アプリのAIアシスタントです。
現在の日時（JST）: ${nowLabel}

${pendingSection}ユーザーのメッセージを以下の分類に分けて、指定の形式で返答してください。

## 分類の基準:
- register: 新しい予定・タスク・メモ・アイデアを新規作成
- ask_deadline: タスク（TASK/DEADLINE_TASK）を登録しようとしているが、ユーザーのメッセージに具体的な期限が含まれていない場合
  ※「今日中」「急いで」「今週中」等の表現は期限として扱い、直接registerにする
  ※ EVENT・NOTE・IDEAには使わない
- edit: 既存アイテムを更新
- delete: 既存アイテムを削除
- query: 登録済みデータへの質問

## 登録済みアイテム（IDと内容）:
${itemsCtx}

## 直近14日間のスケジュール（空き時間計算用）:
${upcomingSchedule}

## 直前に操作したアイテム:
${lastCtx}

## 空き時間の質問への回答ルール:
1. 対象期間を特定
2. 各日のEVENTから空き時間を計算
3. 「ご飯」「食事」「飲み」→ 18:00以降の枠のみ

## 出力形式（必ずこの順序）:
自然な日本語返答（時刻・日付を含める）
${SEP}
JSON（1行）

## JSONスキーマ:
register: {"action":"register","itemData":{"type":"EVENT"|"TASK"|"DEADLINE_TASK"|"NOTE"|"IDEA","title":"30文字以内","content":"省略可","startAt":"省略可","endAt":"省略可","deadlineAt":"省略可"}}
ask_deadline: {"action":"ask_deadline","pendingItem":{"type":"TASK","title":"タスク名","content":"省略可"}}
edit: {"action":"edit","targetId":"末尾8桁","updateData":{"title":"省略可","type":"省略可","content":"省略可","startAt":"省略可またはnull","endAt":"省略可またはnull","deadlineAt":"省略可またはnull"}}
delete: {"action":"delete","targetId":"末尾8桁"}
query: {"action":"query"}

## 出力例（ask_deadline）:
課題ですね。いつまでに終わらせる必要がありますか？
${SEP}
{"action":"ask_deadline","pendingItem":{"type":"TASK","title":"課題"}}

## 出力例（期限付き登録）:
課題を明日23時59分までのタスクとして登録しました。
${SEP}
{"action":"register","itemData":{"type":"DEADLINE_TASK","title":"課題","deadlineAt":"2026-06-21T23:59:00+09:00"}}

## 出力例（通常登録）:
テニスを今日9時から登録しました。
${SEP}
{"action":"register","itemData":{"type":"EVENT","title":"テニス","startAt":"2026-06-20T09:00:00+09:00"}}

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

        const { message, history, lastItemId, pendingItem } = (await request.json()) as {
          message: string;
          history?: { role: "user" | "assistant"; content: string }[];
          lastItemId?: string | null;
          pendingItem?: PendingItem | null;
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
          system: buildSystem(jstNowLabel(), itemsCtx, lastCtx, upcomingSchedule, pendingItem),
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
              const safeEnd = buffer.length - (SEP.length - 1);
              if (safeEnd > cursor) {
                send({ t: "chunk", v: buffer.slice(cursor, safeEnd) });
                cursor = safeEnd;
              }
            }
          }
        }

        let jsonStr = "";

        if (sepAt !== -1) {
          jsonStr = buffer.slice(sepAt + SEP.length).trim();
        } else {
          const cleaned = buffer
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/, "")
            .trim();
          try {
            const parsed = JSON.parse(cleaned) as { reply?: string; action?: string };
            if (parsed.reply && cursor === 0) send({ t: "chunk", v: parsed.reply });
            jsonStr = cleaned;
          } catch {
            const remaining = buffer.slice(cursor).trim();
            if (remaining) send({ t: "chunk", v: remaining });
            send({ t: "done", action: "query" });
            return;
          }
        }

        let result: {
          action: "register" | "edit" | "delete" | "query" | "ask_deadline";
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
          pendingItem?: PendingItem;
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

        // ── ask_deadline ──
        if (result.action === "ask_deadline" && result.pendingItem) {
          send({ t: "done", action: "ask_deadline", pendingItem: result.pendingItem });
          return;
        }

        // ── register ──
        if (result.action === "register" && result.itemData) {
          const d = result.itemData;
          // When resolving a pending deadline inquiry, force DEADLINE_TASK regardless of AI output
          if (pendingItem) {
            d.type = "DEADLINE_TASK";
            if (!d.title) d.title = pendingItem.title;
            if (!d.content && pendingItem.content) d.content = pendingItem.content;
            // If AI forgot deadlineAt but set startAt, promote startAt → deadlineAt
            if (!d.deadlineAt && d.startAt) {
              d.deadlineAt = d.startAt;
              d.startAt = undefined;
            }
          }
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

        // ── edit ──
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

        // ── delete ──
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
