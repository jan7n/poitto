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
  DEADLINE_TASK: "期限タスク",
  NOTE: "メモ",
  IDEA: "アイデア",
};

export const TYPE_COLOR: Record<ItemType, string> = {
  EVENT: "bg-blue-100 text-blue-700",
  TASK: "bg-green-100 text-green-700",
  DEADLINE_TASK: "bg-orange-100 text-orange-700",
  NOTE: "bg-zinc-100 text-zinc-600",
  IDEA: "bg-purple-100 text-purple-700",
};
