"use client";

import ItemCard from "@/components/ItemCard";
import { useItems } from "@/components/ItemsProvider";
import { toJSTKey, fmtDate } from "@/lib/jst";

export default function TodayPage() {
  const { items, fetching, patchItem } = useItems();

  // Use new Date() (real UTC) — toJSTKey handles the JST shift internally
  const todayKey = toJSTKey(new Date());

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

  const todayEvents = items.filter(
    (i) => i.type === "EVENT" && i.startAt && toJSTKey(i.startAt) === todayKey
  );
  const pendingTasks = items.filter(
    (i) => (i.type === "TASK" || i.type === "DEADLINE_TASK") && !i.completed
  );
  const completedTasks = items.filter(
    (i) => (i.type === "TASK" || i.type === "DEADLINE_TASK") && i.completed
  );

  // fmtDate uses Intl with timeZone:"Asia/Tokyo" — pass real Date, not jstNow()
  const todayLabel = fmtDate(new Date());

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">今日</h1>
        <p className="mb-6 text-sm text-zinc-400">{todayLabel}</p>

        {fetching ? (
          <p className="text-sm text-zinc-400">読み込み中...</p>
        ) : (
          <>
            <Section title="今日の予定" count={todayEvents.length}>
              {todayEvents.length === 0 ? (
                <Empty text="今日の予定はありません" />
              ) : (
                <ul className="space-y-3">
                  {todayEvents.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </Section>

            <Section title="やること" count={pendingTasks.length} className="mt-6">
              {pendingTasks.length === 0 ? (
                <Empty text="タスクはありません" />
              ) : (
                <ul className="space-y-3">
                  {pendingTasks.map((item) => (
                    <ItemCard key={item.id} item={item} showCheckbox onToggle={handleToggle} />
                  ))}
                </ul>
              )}
            </Section>

            {completedTasks.length > 0 && (
              <Section title="完了済み" count={completedTasks.length} muted className="mt-6">
                <ul className="space-y-3">
                  {completedTasks.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      showCheckbox
                      onToggle={handleToggle}
                    />
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
  className = "",
  muted = false,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-2">
        <h2
          className={`text-sm font-semibold ${
            muted ? "text-zinc-400" : "text-zinc-700 dark:text-zinc-300"
          }`}
        >
          {title}
        </h2>
        <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-zinc-400">{text}</p>;
}
