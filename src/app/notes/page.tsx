"use client";

import { useState } from "react";
import ItemCard from "@/components/ItemCard";
import { useItems } from "@/components/ItemsProvider";
import type { ItemType } from "@/lib/types";

const FILTERS: { label: string; types: ItemType[] }[] = [
  { label: "すべて", types: ["NOTE", "IDEA"] },
  { label: "メモ", types: ["NOTE"] },
  { label: "アイデア", types: ["IDEA"] },
];

export default function NotesPage() {
  const { items, fetching } = useItems();
  const [filter, setFilter] = useState(0);

  const { types } = FILTERS[filter];
  const filtered = items.filter((i) => types.includes(i.type));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
      <h1 className="mb-6 text-xl font-semibold text-stone-800">メモ</h1>

      <div className="mb-6 flex gap-2">
        {FILTERS.map(({ label }, i) => (
          <button
            key={label}
            onClick={() => setFilter(i)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === i
                ? "bg-stone-800 text-white"
                : "text-stone-500 hover:text-stone-700 hover:bg-stone-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {fetching ? (
        <p className="text-sm text-stone-400">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-stone-400">まだ登録されていません</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => <ItemCard key={item.id} item={item} />)}
        </ul>
      )}
    </div>
  );
}
