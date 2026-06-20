export type ItemType = "EVENT" | "TASK" | "DEADLINE_TASK" | "NOTE" | "IDEA";

export interface Item {
  id: string;
  type: ItemType;
  rawInput: string;
  title: string;
  content: string | null;
  startAt: string | null;
  endAt: string | null;
  deadlineAt: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const TYPE_LABEL: Record<ItemType, string> = {
  EVENT: "予定",
  TASK: "タスク",
  DEADLINE_TASK: "期限",
  NOTE: "メモ",
  IDEA: "アイデア",
};

export const TYPE_COLOR: Record<ItemType, string> = {
  EVENT:         "bg-sky-50 text-sky-600",
  TASK:          "bg-emerald-50 text-emerald-700",
  DEADLINE_TASK: "bg-amber-50 text-amber-700",
  NOTE:          "bg-stone-100 text-stone-500",
  IDEA:          "bg-violet-50 text-violet-600",
};
