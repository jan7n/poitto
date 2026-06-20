const JST_MS = 9 * 60 * 60 * 1000;

// Returns a Date whose UTC components represent the current JST time
export function jstNow(): Date {
  return new Date(Date.now() + JST_MS);
}

// "YYYY-MM-DD" in JST from a UTC date
export function toJSTKey(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const jst = new Date(d.getTime() + JST_MS);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Today's UTC boundary for JST-day queries
export function todayRangeUTC(): { start: Date; end: Date } {
  const jst = jstNow();
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const d = jst.getUTCDate();
  return {
    start: new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - JST_MS),
    end: new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - JST_MS),
  };
}

// "2026年6月21日（土曜日）15:30" form for Claude prompts
export function jstNowLabel(): string {
  const jst = jstNow();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const wd = weekdays[jst.getUTCDay()];
  const h = String(jst.getUTCHours()).padStart(2, "0");
  const min = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日（${wd}曜日）${h}:${min}`;
}

// Display helpers (client-side — uses Intl)
export function fmtDate(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function fmtDateTime(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}
