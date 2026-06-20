"use client";

import { TYPE_COLOR, TYPE_LABEL, type Item } from "@/lib/types";
import { fmtDateTime, fmtTime } from "@/lib/jst";

interface ItemCardProps {
  item: Item;
  showCheckbox?: boolean;
  onToggle?: (id: string, completed: boolean) => void;
}

export default function ItemCard({ item, showCheckbox, onToggle }: ItemCardProps) {
  const dateInfo = getDateInfo(item);

  return (
    <li className={`rounded-xl border bg-white px-4 py-3 transition-opacity ${
      item.completed ? "opacity-40 border-stone-200" : "border-stone-200"
    }`}>
      <div className="flex items-start gap-3">
        {showCheckbox && (
          <button
            type="button"
            onClick={() => onToggle?.(item.id, !item.completed)}
            className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
              item.completed
                ? "border-stone-300 bg-stone-300"
                : "border-stone-300 hover:border-stone-500"
            }`}
            aria-label={item.completed ? "未完了に戻す" : "完了にする"}
          >
            {item.completed && (
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium text-stone-800 leading-snug ${item.completed ? "line-through text-stone-400" : ""}`}>
            {item.title}
          </p>
          {item.content && (
            <p className="mt-0.5 text-xs text-stone-400 line-clamp-2 leading-relaxed">
              {item.content}
            </p>
          )}
          {dateInfo && (
            <p className={`mt-1 text-xs ${dateInfo.color}`}>{dateInfo.text}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_COLOR[item.type]}`}>
          {TYPE_LABEL[item.type]}
        </span>
      </div>
    </li>
  );
}

function getDateInfo(item: Item): { text: string; color: string } | null {
  if (item.type === "EVENT" && item.startAt) {
    const text = item.endAt
      ? `${fmtDateTime(item.startAt)} 〜 ${fmtTime(item.endAt)}`
      : fmtDateTime(item.startAt);
    return { text, color: "text-sky-600" };
  }
  if (item.type === "DEADLINE_TASK" || item.type === "TASK") {
    const date = item.deadlineAt ?? item.startAt;
    if (!date) return null;
    const label = item.deadlineAt ? "期限" : "日時";
    const isOverdue = !item.completed && new Date(date) < new Date();
    return {
      text: `${label}: ${fmtDateTime(date)}`,
      color: isOverdue ? "text-red-500" : "text-amber-600",
    };
  }
  return null;
}
