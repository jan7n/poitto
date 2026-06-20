"use client";

import { TYPE_COLOR, TYPE_LABEL, type Item } from "@/lib/types";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/jst";

interface ItemCardProps {
  item: Item;
  showCheckbox?: boolean;
  onToggle?: (id: string, completed: boolean) => void;
}

export default function ItemCard({ item, showCheckbox, onToggle }: ItemCardProps) {
  const dateInfo = getDateInfo(item);

  return (
    <li className={`rounded-xl border bg-white p-4 shadow-sm transition-opacity dark:bg-zinc-900 ${
      item.completed
        ? "border-zinc-100 opacity-50 dark:border-zinc-800"
        : "border-zinc-100 dark:border-zinc-800"
    }`}>
      <div className="flex items-start gap-3">
        {showCheckbox && (
          <button
            type="button"
            onClick={() => onToggle?.(item.id, !item.completed)}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
              item.completed
                ? "border-zinc-300 bg-zinc-300 dark:border-zinc-600 dark:bg-zinc-600"
                : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-600"
            }`}
            aria-label={item.completed ? "未完了に戻す" : "完了にする"}
          >
            {item.completed && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-zinc-900 dark:text-zinc-100 ${item.completed ? "line-through" : ""}`}>
            {item.title}
          </p>
          {item.content && (
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">
              {item.content}
            </p>
          )}
          {dateInfo && (
            <p className={`mt-1 text-xs ${dateInfo.color}`}>{dateInfo.text}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLOR[item.type]}`}>
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
    return { text, color: "text-blue-600 dark:text-blue-400" };
  }
  if (item.type === "DEADLINE_TASK" && item.deadlineAt) {
    const overdue = new Date(item.deadlineAt) < new Date();
    return {
      text: `期限: ${fmtDateTime(item.deadlineAt)}`,
      color: overdue && !item.completed
        ? "text-red-600 dark:text-red-400"
        : "text-orange-600 dark:text-orange-400",
    };
  }
  return null;
}
