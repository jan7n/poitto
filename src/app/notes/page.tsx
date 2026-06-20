"use client";

import { useState, useEffect, useCallback } from "react";
import ItemCard from "@/components/ItemCard";
import type { Item, ItemType } from "@/lib/types";

const FILTERS: { label: string; types: ItemType[] }[] = [
  { label: "すべて", types: ["NOTE", "IDEA"] },
  { label: "メモ", types: ["NOTE"] },
  { label: "アイデア", types: ["IDEA"] },
];

export default function NotesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [fetching, setFetching] = useState(true);
  const [filter, setFilter] = useState(0);

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/items");
    const data = await res.json();
    if (Array.isArray(data)) setItems(data);
    setFetching(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const { types } = FILTERS[filter];
  const filtered = items.filter((i) => types.includes(i.type));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <h1 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">メモ</h1>

        {/* Filter tabs */}
        <div className="mb-6 flex gap-2">
          {FILTERS.map(({ label }, i) => (
            <button
              key={label}
              onClick={() => setFilter(i)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                filter === i
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {fetching ? (
          <p className="text-sm text-zinc-400">読み込み中...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-zinc-400">まだ登録されていません</p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
