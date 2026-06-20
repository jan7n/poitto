"use client";

import { useState } from "react";
import ItemCard from "@/components/ItemCard";
import { useItems } from "@/components/ItemsProvider";
import { jstNow, toJSTKey, fmtDate } from "@/lib/jst";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function CalendarPage() {
  const { items, fetching } = useItems();

  // jstNow() gives shifted Date — use getUTC* for JST year/month values
  const todayJst = jstNow();
  const [year, setYear] = useState(todayJst.getUTCFullYear());
  const [month, setMonth] = useState(todayJst.getUTCMonth() + 1);

  // Use new Date() (real UTC) — toJSTKey handles JST shift internally
  const todayKey = toJSTKey(new Date());
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey);

  // Track days with EVENTs (blue) and task/deadline days (orange)
  const eventDays = new Set(
    items
      .filter((i) => i.type === "EVENT" && i.startAt)
      .map((i) => toJSTKey(i.startAt!))
  );
  // Include any TASK or DEADLINE_TASK that has deadlineAt (preferred) or startAt
  const deadlineDays = new Set(
    items
      .filter(
        (i) =>
          (i.type === "DEADLINE_TASK" || i.type === "TASK") &&
          (i.deadlineAt ?? i.startAt)
      )
      .map((i) => toJSTKey((i.deadlineAt ?? i.startAt)!))
  );

  const firstDow = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: lastDate }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function keyForDay(d: number) {
    return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  const selectedItems = selectedKey
    ? items.filter((i) => {
        if (i.type === "EVENT" && i.startAt) return toJSTKey(i.startAt) === selectedKey;
        if (i.type === "DEADLINE_TASK" || i.type === "TASK") {
          const date = i.deadlineAt ?? i.startAt;
          return !!date && toJSTKey(date) === selectedKey;
        }
        return false;
      })
    : [];

  const selectedLabel = selectedKey
    ? fmtDate(new Date(selectedKey + "T00:00:00+09:00"))
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          >
            ‹
          </button>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {year}年{month}月
          </h1>
          <button
            onClick={nextMonth}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          >
            ›
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 text-center">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={`py-1 text-xs font-medium ${
                i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-zinc-400"
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} />;
            const key = keyForDay(day);
            const isToday = key === todayKey;
            const hasEvent = eventDays.has(key);
            const hasDeadline = deadlineDays.has(key);
            const isSelected = key === selectedKey;
            return (
              <button
                key={key}
                onClick={() => setSelectedKey(isSelected ? null : key)}
                className={`relative flex flex-col items-center rounded-xl py-2 transition-colors ${
                  isSelected
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : isToday
                    ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                <span
                  className={`text-sm ${idx % 7 === 0 && !isSelected ? "text-red-400" : ""} ${
                    idx % 7 === 6 && !isSelected ? "text-blue-400" : ""
                  }`}
                >
                  {day}
                </span>
                {/* Dot indicators: blue for events, orange for deadlines */}
                {(hasEvent || hasDeadline) && (
                  <div className="mt-0.5 flex gap-0.5">
                    {hasEvent && (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSelected ? "bg-white dark:bg-zinc-900" : "bg-blue-400"
                        }`}
                      />
                    )}
                    {hasDeadline && (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSelected ? "bg-white dark:bg-zinc-900" : "bg-orange-400"
                        }`}
                      />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            予定
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-orange-400" />
            期限タスク
          </div>
        </div>

        {selectedKey && (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {selectedLabel}の予定・期限
            </h2>
            {fetching ? (
              <p className="text-sm text-zinc-400">読み込み中...</p>
            ) : selectedItems.length === 0 ? (
              <p className="text-sm text-zinc-400">この日の予定・期限はありません</p>
            ) : (
              <ul className="space-y-3">
                {selectedItems.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
