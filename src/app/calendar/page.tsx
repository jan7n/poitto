"use client";

import { useState, useEffect, useCallback } from "react";
import ItemCard from "@/components/ItemCard";
import type { Item } from "@/lib/types";
import { jstNow, toJSTKey, fmtDate } from "@/lib/jst";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function CalendarPage() {
  const today = jstNow();
  const [year, setYear] = useState(today.getUTCFullYear());
  const [month, setMonth] = useState(today.getUTCMonth() + 1); // 1-based
  const [selectedKey, setSelectedKey] = useState<string | null>(toJSTKey(today));
  const [items, setItems] = useState<Item[]>([]);
  const [fetching, setFetching] = useState(true);

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/items");
    const data = await res.json();
    if (Array.isArray(data)) setItems(data);
    setFetching(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Build event day set for current month
  const eventDays = new Set(
    items
      .filter((i) => i.type === "EVENT" && i.startAt)
      .map((i) => toJSTKey(i.startAt!))
  );

  // Calendar grid
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const lastDate = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: lastDate }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function keyForDay(d: number) {
    return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const todayKey = toJSTKey(today);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  const selectedItems = selectedKey
    ? items.filter(
        (i) => i.type === "EVENT" && i.startAt && toJSTKey(i.startAt) === selectedKey
      )
    : [];

  const selectedLabel = selectedKey
    ? fmtDate(new Date(selectedKey + "T00:00:00+09:00"))
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
        {/* Month header */}
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

        {/* Weekday headers */}
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

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} />;
            const key = keyForDay(day);
            const isToday = key === todayKey;
            const hasEvent = eventDays.has(key);
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
                <span className={`text-sm ${
                  idx % 7 === 0 && !isSelected ? "text-red-400" : ""
                } ${idx % 7 === 6 && !isSelected ? "text-blue-400" : ""}`}>
                  {day}
                </span>
                {hasEvent && (
                  <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                    isSelected ? "bg-white dark:bg-zinc-900" : "bg-blue-400"
                  }`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day events */}
        {selectedKey && (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {selectedLabel}の予定
            </h2>
            {fetching ? (
              <p className="text-sm text-zinc-400">読み込み中...</p>
            ) : selectedItems.length === 0 ? (
              <p className="text-sm text-zinc-400">この日の予定はありません</p>
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
