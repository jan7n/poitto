"use client";

import { useState } from "react";
import ItemCard from "@/components/ItemCard";
import { useItems } from "@/components/ItemsProvider";

export default function TasksPage() {
  const { items, fetching, patchItem } = useItems();
  const [showCompleted, setShowCompleted] = useState(false);

  async function handleToggle(id: string, completed: boolean) {
    const res = await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    if (res.ok) {
      const updated = await res.json();
      patchItem(updated);
    }
  }

  const allTasks = items.filter((i) => i.type === "TASK" || i.type === "DEADLINE_TASK");
  const overdue = allTasks.filter(
    (i) => !i.completed && i.type === "DEADLINE_TASK" && i.deadlineAt && new Date(i.deadlineAt) < new Date()
  );
  const pending = allTasks.filter(
    (i) => !i.completed && !(i.type === "DEADLINE_TASK" && i.deadlineAt && new Date(i.deadlineAt) < new Date())
  );
  const completed = allTasks.filter((i) => i.completed);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
      <h1 className="mb-8 text-xl font-semibold text-stone-800">タスク</h1>

      {overdue.length > 0 && (
        <div className="mb-8">
          <SectionHeader label="期限切れ" count={overdue.length} color="text-red-500" />
          <ul className="space-y-2">
            {overdue.map((item) => <ItemCard key={item.id} item={item} showCheckbox onToggle={handleToggle} />)}
          </ul>
        </div>
      )}

      <div className="mb-8">
        <SectionHeader label="未完了" count={pending.length} />
        {pending.length === 0 ? (
          <p className="text-sm text-stone-400">タスクはありません</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((item) => <ItemCard key={item.id} item={item} showCheckbox onToggle={handleToggle} />)}
          </ul>
        )}
      </div>

      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted((s) => !s)}
            className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-stone-400 hover:text-stone-600"
          >
            完了済み <span className="text-stone-300">{completed.length}</span>
            <span className="text-[10px]">{showCompleted ? "▲" : "▼"}</span>
          </button>
          {showCompleted && (
            <ul className="space-y-2">
              {completed.map((item) => <ItemCard key={item.id} item={item} showCheckbox onToggle={handleToggle} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  label,
  count,
  color = "text-stone-500",
}: {
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className={`text-xs font-semibold uppercase tracking-widest ${color}`}>{label}</h2>
      <span className="text-xs text-stone-400">{count}</span>
    </div>
  );
}
