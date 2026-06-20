"use client";

import { useState, useEffect, useRef } from "react";
import { TYPE_COLOR, TYPE_LABEL, type Item } from "@/lib/types";
import { fmtDateTime, fmtTime } from "@/lib/jst";
import { useItems } from "@/components/ItemsProvider";

interface ConvMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  item?: Item;
}

interface PendingItem {
  type: string;
  title: string;
  content?: string;
}

const WELCOME: ConvMsg = {
  id: "welcome",
  role: "assistant",
  content:
    "こんにちは！予定・タスク・メモ・アイデアはなんでも入力してください。\n「明日の予定は？」のような質問もOKです。",
};

const STORAGE_KEY = "poitto-chat-v1";

export default function Home() {
  const { refresh: refreshItems } = useItems();
  const [messages, setMessages] = useState<ConvMsg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastItemId, setLastItemId] = useState<string | null>(null);
  const [pendingItem, setPendingItem] = useState<PendingItem | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        messages: ConvMsg[];
        lastItemId: string | null;
        pendingItem?: PendingItem | null;
      };
      if (saved.messages?.length > 0) setMessages(saved.messages);
      if (saved.lastItemId) setLastItemId(saved.lastItemId);
      if (saved.pendingItem) setPendingItem(saved.pendingItem);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ messages: messages.slice(-60), lastItemId, pendingItem })
      );
    } catch {}
  }, [messages, lastItemId, pendingItem]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function resizeTextarea() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  async function submit() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: ConvMsg = { id: `u-${Date.now()}`, role: "user", content: text };
    const loadingId = `l-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: loadingId, role: "assistant", content: "" },
    ]);
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, lastItemId, pendingItem }),
      });

      if (!res.ok || !res.body) throw new Error("Network error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              t: string;
              v?: string;
              action?: string;
              item?: Item;
              deletedId?: string;
              message?: string;
              pendingItem?: PendingItem;
            };

            if (event.t === "chunk" && event.v) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === loadingId ? { ...m, content: m.content + event.v } : m
                )
              );
            } else if (event.t === "done") {
              if (event.action === "ask_deadline" && event.pendingItem) {
                setPendingItem(event.pendingItem);
              } else {
                setPendingItem(null);
                if (event.item) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === loadingId ? { ...m, item: event.item } : m
                    )
                  );
                  setLastItemId(event.item.id);
                  refreshItems();
                } else if (event.action === "delete") {
                  if (event.deletedId === lastItemId) setLastItemId(null);
                  refreshItems();
                }
              }
            } else if (event.t === "error" && event.message) {
              setPendingItem(null);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === loadingId ? { ...m, content: event.message! } : m
                )
              );
            }
          } catch {}
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingId
            ? { ...m, content: "エラーが発生しました。もう一度お試しください。" }
            : m
        )
      );
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  return (
    <>
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <div className="space-y-4">
          {messages.map((msg) =>
            msg.role === "user" ? (
              <UserBubble key={msg.id} content={msg.content} />
            ) : (
              <AssistantBubble
                key={msg.id}
                content={msg.content}
                item={msg.item}
                isLoading={msg.content === "" && loading}
              />
            )
          )}
        </div>
        <div ref={bottomRef} className="h-44" aria-hidden="true" />
      </div>

      {/* Input area */}
      <div
        className="fixed left-0 right-0 z-40 bg-[#F5F4EF] border-t border-stone-200"
        style={{ bottom: "calc(68px + env(safe-area-inset-bottom))" }}
      >
        {pendingItem && (
          <div className="mx-auto max-w-2xl px-4 pt-2.5">
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <span>⏰</span>
              <span>「{pendingItem.title}」の期限はいつですか？</span>
              <button
                onClick={() => setPendingItem(null)}
                className="ml-auto text-amber-400 hover:text-amber-600"
                aria-label="キャンセル"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="mx-auto flex max-w-2xl items-end gap-2 px-4 py-3">
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            placeholder={
              pendingItem
                ? `「${pendingItem.title}」の期限を入力（例：明日、来週月曜）`
                : "予定やタスクを入力、または質問…"
            }
            className="flex-1 resize-none rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-800 placeholder-stone-400 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-100"
            style={{ minHeight: "42px", maxHeight: "160px" }}
            onChange={(e) => {
              setInput(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={loading || !input.trim()}
            aria-label="送信"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-800 text-white transition-colors hover:bg-stone-600 disabled:opacity-30"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%] rounded-2xl rounded-tr-sm bg-stone-800 px-4 py-2.5">
        <p className="whitespace-pre-wrap text-sm text-stone-50 leading-relaxed">{content}</p>
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  item,
  isLoading,
}: {
  content: string;
  item?: Item;
  isLoading: boolean;
}) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[78%] rounded-2xl rounded-tl-sm border border-stone-200 bg-white px-4 py-2.5">
        {isLoading ? (
          <ThinkingDots />
        ) : (
          <>
            <p className="whitespace-pre-wrap text-sm text-stone-700 leading-relaxed">{content}</p>
            {item && <MiniItemCard item={item} />}
          </>
        )}
      </div>
    </div>
  );
}

function MiniItemCard({ item }: { item: Item }) {
  let dateText = "";
  if (item.type === "EVENT" && item.startAt) {
    dateText = item.endAt
      ? `${fmtDateTime(item.startAt)} 〜 ${fmtTime(item.endAt)}`
      : fmtDateTime(item.startAt);
  } else if (item.type === "DEADLINE_TASK" || item.type === "TASK") {
    const date = item.deadlineAt ?? item.startAt;
    if (date) dateText = `${item.deadlineAt ? "期限" : "日時"}: ${fmtDateTime(date)}`;
  }

  return (
    <div className="mt-2 rounded-lg border border-stone-100 bg-stone-50 p-2.5">
      <div className="flex items-center gap-1.5">
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLOR[item.type]}`}>
          {TYPE_LABEL[item.type]}
        </span>
        <span className="text-xs font-medium text-stone-700">{item.title}</span>
      </div>
      {item.content && (
        <p className="mt-0.5 line-clamp-1 text-[11px] text-stone-400">{item.content}</p>
      )}
      {dateText && (
        <p className="mt-0.5 text-[11px] text-stone-500">{dateText}</p>
      )}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex gap-1.5 py-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 rounded-full bg-stone-300"
          style={{ animation: `pulse-dot 1.2s ease-in-out ${delay}ms infinite` }}
        />
      ))}
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
