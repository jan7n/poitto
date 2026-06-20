"use client";

import { useState } from "react";
import ItemCard from "@/components/ItemCard";
import { useItems } from "@/components/ItemsProvider";
import { jstNow, toJSTKey, fmtDate } from "@/lib/jst";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function CalendarPage() {
  const { items, fetching } = useItems();

  const todayJst = jstNow();
  const [year, setYear] = useState(todayJst.getUTCFullYear());
  const [month, setMonth] = useState(todayJst.getUTCMonth() + 1);

  const todayKey = toJSTKey(new Date());
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey);

  const eventDays = new Set(
    items.filter((i) => i.type === "EVENT" && i.startAt).map((i) => toJSTKey(i.startAt!))
  );
  const deadlineDays = new Set(
    items
      .filter((i) => (i.type === "DEADLINE_TASK" || i.type === "TASK") && (i.deadlineAt ?? i.startAt))
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
    <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
      {/* Month navigation */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 transition-colors text-lg"
        >
          ‹
        </button>
        <h1 className="text-base font-semibold text-stone-800">
          {year}年{month}月
        </h1>
        <button
          onClick={nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 transition-colors text-lg"
        >
          ›
        </button>
      </div>

      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            className={`py-1 text-[11px] font-medium ${
              i === 0 ? "text-red-400" : i === 6 ? "text-sky-400" : "text-stone-400"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
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
              className={`relative flex flex-col items-center rounded-lg py-2 transition-colors ${
                isSelected
                  ? "bg-stone-800 text-white"
                  : isToday
                  ? "bg-stone-100 text-stone-900 font-semibold"
                  : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              <span
                className={`text-sm ${
                  idx % 7 === 0 && !isSelected ? "text-red-400" : ""
                } ${idx % 7 === 6 && !isSelected ? "text-sky-400" : ""}`}
              >
                {day}
              </span>
              {(hasEvent || hasDeadline) && (
                <div className="mt-0.5 flex gap-0.5">
                  {hasEvent && (
                    <span className={`h-1 w-1 rounded-full ${isSelected ? "bg-white/60" : "bg-sky-400"}`} />
                  )}
                  {hasDeadline && (
                    <span className={`h-1 w-1 rounded-full ${isSelected ? "bg-white/60" : "bg-amber-400"}`} />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-stone-400">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          予定
        </div>
        <div className="flex items-center gap-1.5 text-xs text-stone-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          期限タスク
        </div>
      </div>

      {/* Selected day */}
      {selectedKey && (
        <div className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-stone-500">
            {selectedLabel}
          </h2>
          {selectedItems.length === 0 ? (
            <p className="text-sm text-stone-400">この日の予定・期限はありません</p>
          ) : (
            <ul className="space-y-2">
              {selectedItems.map((item) => <ItemCard key={item.id} item={item} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
