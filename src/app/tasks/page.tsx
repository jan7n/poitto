"use client";

import { useState, useEffect, useCallback } from "react";
import ItemCard from "@/components/ItemCard";
import type { Item } from "@/lib/types";

export default function TasksPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/items");
    const data = await res.json();
    if (Array.isArray(data)) setItems(data);
    setFetching(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleToggle(id: string, completed: boolean) {
    const res = await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    }
  }

  const allTasks = items.filter(
    (i) => i.type === "TASK" || i.type === "DEADLINE_TASK"
  );

  const overdue = allTasks.filter(
    (i) =>
      !i.completed &&
      i.type === "DEADLINE_TASK" &&
      i.deadlineAt &&
      new Date(i.deadlineAt) < new Date()
  );
  const pending = allTasks.filter(
    (i) =>
      !i.completed &&
      !(
        i.type === "DEADLINE_TASK" &&
        i.deadlineAt &&
        new Date(i.deadlineAt) < new Date()
      )
  );
  const completed = allTasks.filter((i) => i.completed);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">タスク</h1>

        {fetching ? (
          <p className="text-sm text-zinc-400">読み込み中...</p>
        ) : (
          <>
            {overdue.length > 0 && (
              <div className="mb-6">
                <SectionHeader title="期限切れ" count={overdue.length} colorClass="text-red-600" />
                <ul className="space-y-3">
                  {overdue.map((item) => (
                    <ItemCard key={item.id} item={item} showCheckbox onToggle={handleToggle} />
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-6">
              <SectionHeader title="未完了" count={pending.length} />
              {pending.length === 0 ? (
                <p className="text-sm text-zinc-400">タスクはありません</p>
              ) : (
                <ul className="space-y-3">
                  {pending.map((item) => (
                    <ItemCard key={item.id} item={item} showCheckbox onToggle={handleToggle} />
                  ))}
                </ul>
              )}
            </div>

            {completed.length > 0 && (
              <div>
                <button
                  onClick={() => setShowCompleted((s) => !s)}
                  className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-zinc-600"
                >
                  <SectionHeader title="完了済み" count={completed.length} muted inline />
                  <span>{showCompleted ? "▲" : "▼"}</span>
                </button>
                {showCompleted && (
                  <ul className="space-y-3">
                    {completed.map((item) => (
                      <ItemCard key={item.id} item={item} showCheckbox onToggle={handleToggle} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  colorClass = "text-zinc-700 dark:text-zinc-300",
  muted = false,
  inline = false,
}: {
  title: string;
  count: number;
  colorClass?: string;
  muted?: boolean;
  inline?: boolean;
}) {
  const content = (
    <div className={`flex items-center gap-2 ${inline ? "" : "mb-3"}`}>
      <h2 className={`text-sm font-semibold ${muted ? "text-zinc-400" : colorClass}`}>
        {title}
      </h2>
      <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        {count}
      </span>
    </div>
  );
  return content;
}
