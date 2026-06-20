import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { jstNow, jstNowLabel, toJSTKey, fmtTime, fmtDateTime, parseAsJST } from "@/lib/jst";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ClassifyResult {
  action: "register" | "edit" | "delete" | "query";
  reply: string;
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
}

// Day-by-day upcoming schedule for free-time queries
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

ユーザーのメッセージを以下4種類に分類し、JSONのみで返答してください（コードブロック不要）。

## 分類の基準:
- register: 新しい予定・タスク・メモ・アイデアを新規作成（「〇〇がある」「〇〇しなきゃ」等）
- edit: 既存アイテムを更新（「〇〇に変えて」「修正して」「タイトルを〇〇に」等）
- delete: 既存アイテムを削除（「消して」「削除して」「取り消して」等）
- query: 登録済みデータへの質問（「〇〇は？」「空き時間は？」「ご飯行けそうな時」等）

## 登録済みアイテム（IDと内容）:
${itemsCtx}

## 直近14日間のスケジュール（空き時間計算用）:
${upcomingSchedule}

## 直前に操作したアイテム（「さっき」「直前の」「最後に登録した」の基準）:
${lastCtx}

## 空き時間の質問への回答ルール（「いつ空いてる？」「ご飯行けそう」等）:
1. 対象期間を特定（今週・来週・今週末等）
2. 各日のEVENTから空き時間を計算:
   - 予定なし → 「終日」
   - 午前のみ予定 → 「終了時刻以降」
   - 複数予定 → 隙間時間を表示
3. 「ご飯」「食事」「飲み」→ 18:00以降の枠のみ
4. フォーマット: 冒頭1行コメント、箇条書きリスト（日付・曜日・時間帯）、末尾「予定が入っている時間を除いた空き時間です。」

## 返答形式（JSONのみ）:
{
  "action": "register" | "edit" | "delete" | "query",
  "reply": "ユーザーへの自然な日本語返答",
  "targetId": "操作対象アイテムのID（edit・deleteのみ必須）",
  "itemData": {
    "type": "EVENT" | "TASK" | "DEADLINE_TASK" | "NOTE" | "IDEA",
    "title": "タイトル（30文字以内）",
    "content": "補足（省略可）",
    "startAt": "YYYY-MM-DDThh:mm:00+09:00（省略可）",
    "endAt": "YYYY-MM-DDThh:mm:00+09:00（省略可）",
    "deadlineAt": "YYYY-MM-DDThh:mm:00+09:00（省略可）"
  },
  "updateData": {
    "type": "変更後type（省略可）",
    "title": "変更後タイトル（省略可）",
    "content": "変更後内容（省略可）",
    "startAt": "変更後開始時刻またはnull（省略可）",
    "endAt": "変更後終了時刻またはnull（省略可）",
    "deadlineAt": "変更後期限またはnull（省略可）"
  }
}

## フィールドの使い分け:
- action="register" → itemDataのみ（targetId不要）
- action="edit" → targetId + updateData（変更するフィールドのみ）
- action="delete" → targetIdのみ（updateData不要）
- action="query" → replyのみ
- 「さっき」「直前」「最後に」→ 直前に操作したアイテムのIDをtargetIdに使う
- 日時はJST（UTC+9）オフセット付きISO 8601形式
- 「明日」「来週末」等は現在のJST日時基準で解釈
- replyに時刻・日付を必ず含める（例：「9時からテニスを登録しました」「明日14時の会議を追加しました」）`;
}

export async function POST(request: Request) {
  try {
    const { message, history, lastItemId } = (await request.json()) as {
      message: string;
      history?: { role: "user" | "assistant"; content: string }[];
      lastItemId?: string | null;
    };

    const supabase = await createSupabaseServerClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure User record exists (create on first message only)
    let user = await prisma.user.findUnique({ where: { id: authUser.id } });
    if (!user) {
      user = await prisma.user.create({
        data: { id: authUser.id, email: authUser.email ?? "" },
      });
    }

    // Fetch only fields needed for AI context (skip content/rawInput to reduce payload)
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

    // Include short IDs in context so Claude can reference them
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

    // ID suffix → full ID map for resolving Claude's short references
    const idMap = new Map(items.map((i) => [i.id.slice(-8), i.id]));

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

    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: buildSystem(jstNowLabel(), itemsCtx, lastCtx, upcomingSchedule),
      messages: msgs,
    });

    const raw = res.content[0].type === "text" ? res.content[0].text : "";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let result: ClassifyResult;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return Response.json({ action: "query", reply: raw.trim() });
    }

    // Resolve short ID suffix to full ID
    function resolveId(shortId?: string): string | null {
      if (!shortId) return null;
      // Claude might return the full ID or just the suffix
      if (items.some((i) => i.id === shortId)) return shortId;
      return idMap.get(shortId) ?? null;
    }

    // ── register ──
    if (result.action === "register" && result.itemData) {
      const d = result.itemData;
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
      return Response.json({ action: "register", reply: result.reply, item });
    }

    // ── edit ──
    if (result.action === "edit" && result.updateData) {
      const targetId = resolveId(result.targetId) ?? lastItemId;
      if (!targetId) {
        return Response.json({ action: "query", reply: "更新対象のアイテムが特定できませんでした。" });
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
        return Response.json({ action: "edit", reply: result.reply, item });
      } catch {
        return Response.json({ action: "query", reply: "更新対象のアイテムが見つかりませんでした。" });
      }
    }

    // ── delete ──
    if (result.action === "delete") {
      const targetId = resolveId(result.targetId) ?? lastItemId;
      if (!targetId) {
        return Response.json({ action: "query", reply: "削除対象のアイテムが特定できませんでした。" });
      }
      try {
        await prisma.item.delete({ where: { id: targetId } });
        return Response.json({ action: "delete", reply: result.reply, deletedId: targetId });
      } catch {
        return Response.json({ action: "query", reply: "削除対象のアイテムが見つかりませんでした。" });
      }
    }

    return Response.json({ action: "query", reply: result.reply ?? raw });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
