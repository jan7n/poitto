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

interface DeletedItemData {
  id: string;
  type: ItemType;
  title: string;
  rawInput?: string;
  content?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  deadlineAt?: string | null;
  completed: boolean;
  completedAt?: string | null;
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
  pendingItem?: PendingItem | null,
  recentlyDeleted?: DeletedItemData[]
) {
  const pendingSection = pendingItem
    ? `最優先: 「${pendingItem.title}」の期限ヒアリング中。
ユーザーの返答から期限日時を解析し、DEADLINE_TASKとして登録すること。
- itemData.type: "DEADLINE_TASK"
- itemData.title: "${pendingItem.title}"
- itemData.deadlineAt: JSTオフセット付きISO 8601（必須・省略不可）
  時刻不明の場合は 23:59:00 にする
期限が読み取れない場合のみ action:"query"。

`
    : "";

  const recentlyDeletedCtx =
    recentlyDeleted && recentlyDeleted.length > 0
      ? `\n## 最近削除されたアイテム（UNDO可能）:\n${recentlyDeleted
          .map((d) => {
            const parts = [`${d.id.slice(-8)} [${d.type}] ${d.title}`];
            if (d.deadlineAt) parts.push(`期限:${d.deadlineAt}`);
            return parts.join(" ");
          })
          .join("\n")}\n`
      : "";

  return `あなたは「ポイッと」アプリのAIアシスタントです。
現在の日時（JST）: ${nowLabel}

${pendingSection}【文体ルール・最重要】
・マークダウン記号（**、*、#、---、_、\`）は絶対に使わない
・箇条書きは「・」を使う
・日程の空き時間を答える時は以下の形式（改行+字下げ）:
  6月21日（日）
  ・20:00 さなみとこはん
  ・それ以外は空いています
・1〜3文で簡潔に。長い文を一文に詰め込まない

## 登録済みアイテム:
${itemsCtx}
${recentlyDeletedCtx}
## 直近14日間:
${upcomingSchedule}

## 直前操作:
${lastCtx}

## 分類:
- register: 新規登録（1件のみ）
- register_group: 複数アイテムを一括登録（1メッセージに2件以上含まれる場合は必ずこちらを使う）
  例:「明後日17時からさなみさんとごはん、26日上司とご飯」→ 2件をregister_group
  ※ registerを2回ではなく、register_groupを1回使う
- ask_deadline: タスクだが期限なし（「今日中」「急いで」は直接register）
- show: 既存アイテムをカード表示（ユーザーが名前を言及・質問した場合）
  ※ 登録・編集・削除の意図がない時に使う
  ※ 返答は「〜ですね。」のみ。行動提案・アドバイス禁止
- edit: 既存更新（タイトル・日時・詳細の変更）
  + ユーザーが既存イベント/タスクに追加情報・メモ・やること等を言及した場合も edit でcontentを更新する
  例:「さなみさんとご飯の時に〇〇について話し合う必要がある」
     → "さなみさんとご飯"を特定し updateData.content を設定
  ※ 既存のcontentがある場合は「既存の内容\n新しい情報」と追記すること
  ※ 編集後のアイテムがチャットにカード表示される
- delete: 1件削除
- delete_group: 複数アイテムを一括削除
  【重要】以下の表現はすべて delete_group を使う（完了・終了・済み = このアプリでは削除）:
  「〜全部終わった」「〜全部やった」「〜全部できた」「〜全部済ませた」
  「〜消して」「〜全部削除して」「〜片付いた」「〜終わったから消して」
  JSON には必ず keyword と targetIds を両方含める:
  ・keyword: タイトルに含まれる検索キーワード（例: "課題"）
  ・targetIds: 登録済みアイテムから一致するTASK/DEADLINE_TASKの末尾8桁IDをすべて列挙
  例:「課題全部終わった！」→ keyword:"課題", targetIds に課題タスクのID全部
- restore: 最近削除されたアイテムをUNDO（「〜を戻して」「復活させて」）
  ※ 「最近削除されたアイテム」から該当のIDを特定する
- query: 質問・会話

## 出力形式（必ずこの順序）:
日本語返答
${SEP}
JSON（1行）

## JSONスキーマ:
register: {"action":"register","itemData":{"type":"EVENT"|"TASK"|"DEADLINE_TASK"|"NOTE"|"IDEA","title":"30文字以内","startAt":"省略可","endAt":"省略可","deadlineAt":"省略可"}}
register_group: {"action":"register_group","items":[{"type":"...","title":"...","startAt":"..."},{"type":"...","title":"..."}]}
ask_deadline: {"action":"ask_deadline","pendingItem":{"type":"TASK","title":"名前"}}
show: {"action":"show","targetId":"末尾8桁"}
edit: {"action":"edit","targetId":"末尾8桁","updateData":{}}
delete: {"action":"delete","targetId":"末尾8桁"}
delete_group: {"action":"delete_group","keyword":"キーワード","targetIds":["末尾8桁1","末尾8桁2"]}
restore: {"action":"restore","targetId":"末尾8桁（元のID）"}
query: {"action":"query"}

## 出力例（register_group）:
以下の2件を追加しました。
${SEP}
{"action":"register_group","items":[{"type":"EVENT","title":"さなみさんとごはん","startAt":"2024-06-23T17:00:00+09:00"},{"type":"EVENT","title":"上司とご飯","startAt":"2024-06-26T00:00:00+09:00"}]}

## 出力例（show）:
課題を先生に送るですね。
${SEP}
{"action":"show","targetId":"abcd1234"}

## 出力例（delete_group）:
以下の課題タスクを削除しました。
${SEP}
{"action":"delete_group","keyword":"課題","targetIds":["abcd1234","ef567890","12345678"]}

## 注意:
- 日時はJST（+09:00）オフセット付きISO 8601
- 「さっき」「最後に」→ 直前操作のIDをtargetIdに
- 「明日」等は現在のJST日時基準`;
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
        // Safari buffers until 1024 bytes — flush immediately
        controller.enqueue(encoder.encode(`: ${"x".repeat(1016)}\n\n`));

        const supabase = await createSupabaseServerClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          send({ t: "error", message: "認証エラーです。" });
          return;
        }

        const { message, history, lastItemId, pendingItem, recentlyDeleted } = (await request.json()) as {
          message: string;
          history?: { role: "user" | "assistant"; content: string }[];
          lastItemId?: string | null;
          pendingItem?: PendingItem | null;
          recentlyDeleted?: DeletedItemData[];
        };

        // Parallelize user upsert + items fetch (saves one serial round-trip)
        const [user, items] = await Promise.all([
          prisma.user.upsert({
            where: { id: authUser.id },
            update: {},
            create: { id: authUser.id, email: authUser.email ?? "" },
          }),
          prisma.item.findMany({
            where: { userId: authUser.id },
            orderBy: { createdAt: "desc" },
            take: 40,
            select: {
              id: true,
              type: true,
              title: true,
              content: true,
              startAt: true,
              endAt: true,
              deadlineAt: true,
              completed: true,
            },
          }),
        ]);

        void user; // used only for upsert side-effect

        const idMap = new Map(items.map((i) => [i.id.slice(-8), i.id]));

        const itemsCtx =
          items.length === 0
            ? "（まだ登録なし）"
            : items
                .map((i) => {
                  const parts = [`${i.id.slice(-8)} [${i.type}] ${i.title}`];
                  if (i.startAt) parts.push(`開始:${fmtDateTime(i.startAt)}`);
                  if (i.endAt) parts.push(`終了:${fmtDateTime(i.endAt)}`);
                  if (i.deadlineAt) parts.push(`期限:${fmtDateTime(i.deadlineAt)}`);
                  if (i.content) parts.push(`詳細:${i.content.slice(0, 40)}`);
                  if (i.completed) parts.push("✓");
                  return parts.join(" ");
                })
                .join("\n");

        let lastCtx = "（なし）";
        if (lastItemId) {
          const last = items.find((i) => i.id === lastItemId);
          if (last) {
            const parts = [`${last.id.slice(-8)} [${last.type}] ${last.title}`];
            if (last.startAt) parts.push(`開始:${fmtDateTime(last.startAt)}`);
            if (last.deadlineAt) parts.push(`期限:${fmtDateTime(last.deadlineAt)}`);
            lastCtx = parts.join(" ");
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
          max_tokens: 800,
          system: buildSystem(jstNowLabel(), itemsCtx, lastCtx, upcomingSchedule, pendingItem, recentlyDeleted),
          messages: msgs,
        });

        let buffer = "";
        let cursor = 0;
        let sepAt = -1;

        for await (const event of claudeStream) {
          if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") continue;
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
          const cleaned = buffer.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
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
          action: "register" | "register_group" | "edit" | "delete" | "delete_group" | "restore" | "query" | "ask_deadline" | "show";
          targetId?: string;
          targetIds?: string[];
          keyword?: string;
          itemData?: {
            type: ItemType;
            title: string;
            content?: string;
            startAt?: string;
            endAt?: string;
            deadlineAt?: string;
          };
          items?: Array<{
            type: ItemType;
            title: string;
            content?: string;
            startAt?: string;
            endAt?: string;
            deadlineAt?: string;
          }>;
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

        // Debug: log every action to Vercel function logs
        console.log("[poitto/message]", result.action, JSON.stringify(result).slice(0, 300));

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

        // ── show ──
        if (result.action === "show") {
          const targetId = resolveId(result.targetId) ?? lastItemId;
          if (targetId) {
            try {
              const item = await prisma.item.findUnique({ where: { id: targetId } });
              if (item) {
                send({ t: "done", action: "show", item });
                return;
              }
            } catch {}
          }
          send({ t: "done", action: "query" });
          return;
        }

        // ── register ──
        if (result.action === "register" && result.itemData) {
          const d = result.itemData;
          if (pendingItem) {
            d.type = "DEADLINE_TASK";
            if (!d.title) d.title = pendingItem.title;
            if (!d.content && pendingItem.content) d.content = pendingItem.content;
            if (!d.deadlineAt && d.startAt) { d.deadlineAt = d.startAt; d.startAt = undefined; }
          }
          try {
            const item = await prisma.item.create({
              data: {
                userId: authUser.id,
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

        // ── register_group ──
        if (result.action === "register_group" && result.items?.length) {
          try {
            const created = await Promise.all(
              result.items.map((d) =>
                prisma.item.create({
                  data: {
                    userId: authUser.id,
                    rawInput: message,
                    type: d.type ?? "NOTE",
                    title: d.title ?? message.slice(0, 30),
                    content: d.content ?? null,
                    startAt: parseAsJST(d.startAt),
                    endAt: parseAsJST(d.endAt),
                    deadlineAt: parseAsJST(d.deadlineAt),
                  },
                })
              )
            );
            send({ t: "done", action: "register_group", items: created });
          } catch {
            send({ t: "done", action: "query" });
          }
          return;
        }

        // ── edit ──
        if (result.action === "edit" && result.updateData) {
          const targetId = resolveId(result.targetId) ?? lastItemId;
          if (!targetId) { send({ t: "done", action: "query" }); return; }
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

        // ── delete (single) ──
        if (result.action === "delete") {
          const targetId = resolveId(result.targetId) ?? lastItemId;
          if (!targetId) { send({ t: "done", action: "query" }); return; }
          try {
            // prisma.item.delete returns the deleted record — use it for UNDO
            const deletedItem = await prisma.item.delete({ where: { id: targetId } });
            send({ t: "done", action: "delete", deletedId: targetId, item: deletedItem });
          } catch {
            send({ t: "done", action: "query" });
          }
          return;
        }

        // ── delete_group ──
        if (result.action === "delete_group") {
          // Primary: resolve explicit IDs
          let ids: string[] = (result.targetIds ?? [])
            .map((s) => resolveId(s))
            .filter((id): id is string => id !== null);

          // Fallback: keyword search in title when IDs are missing/wrong
          if (ids.length === 0 && result.keyword) {
            const kw = result.keyword.trim();
            console.log("[poitto/delete_group] keyword fallback:", kw);
            const matching = await prisma.item.findMany({
              where: {
                userId: authUser.id,
                title: { contains: kw },
                type: { in: ["TASK", "DEADLINE_TASK"] },
                completed: false,
              },
              select: { id: true },
            });
            ids = matching.map((i) => i.id);
          }

          console.log("[poitto/delete_group] resolved ids:", ids);

          if (ids.length === 0) { send({ t: "done", action: "query" }); return; }

          try {
            // Fetch full item data first so client can UNDO
            const toDelete = await prisma.item.findMany({
              where: { id: { in: ids }, userId: authUser.id },
            });
            await prisma.item.deleteMany({
              where: { id: { in: ids }, userId: authUser.id },
            });
            console.log("[poitto/delete_group] deleted:", toDelete.map((i) => i.title));
            send({ t: "done", action: "delete_group", items: toDelete });
          } catch (e) {
            console.error("[poitto/delete_group] error:", e);
            send({ t: "done", action: "query" });
          }
          return;
        }

        // ── restore ──
        if (result.action === "restore") {
          const shortId = result.targetId;
          const deleted = recentlyDeleted?.find(
            (d) => d.id.slice(-8) === shortId || d.id === shortId
          );

          if (!deleted) { send({ t: "done", action: "query" }); return; }

          const originalId = deleted.id;
          try {
            const item = await prisma.item.create({
              data: {
                userId: authUser.id,
                rawInput: deleted.rawInput ?? message,
                type: deleted.type,
                title: deleted.title,
                content: deleted.content ?? null,
                startAt: deleted.startAt ? new Date(deleted.startAt) : null,
                endAt: deleted.endAt ? new Date(deleted.endAt) : null,
                deadlineAt: deleted.deadlineAt ? new Date(deleted.deadlineAt) : null,
                completed: deleted.completed,
                completedAt: deleted.completedAt ? new Date(deleted.completedAt) : null,
              },
            });
            send({ t: "done", action: "restore", item, originalId });
          } catch {
            send({ t: "done", action: "query" });
          }
          return;
        }

        send({ t: "done", action: "query" });
      } catch (err) {
        console.error(err);
        try { send({ t: "error", message: "エラーが発生しました。" }); } catch {}
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
