"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { Item } from "@/lib/types";

const CACHE_KEY = "poitto-items-cache-v1";

interface ItemsContextValue {
  items: Item[];
  fetching: boolean;
  refresh: () => void;
  patchItem: (updated: Item) => void;
}

const ItemsContext = createContext<ItemsContextValue>({
  items: [],
  fetching: false,
  refresh: () => {},
  patchItem: () => {},
});

export function ItemsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [fetching, setFetching] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/items");
      if (!res.ok) return;
      const data = (await res.json()) as Item[];
      if (Array.isArray(data)) {
        setItems(data);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {}
      }
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    // Show cached items immediately — eliminates "読み込み中..." on repeat visits
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as Item[];
        if (Array.isArray(cached) && cached.length > 0) {
          setItems(cached);
          setFetching(false);
        }
      }
    } catch {}
    void fetchItems();
  }, [fetchItems]);

  const patchItem = useCallback((updated: Item) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }, []);

  const refresh = useCallback(() => {
    void fetchItems();
  }, [fetchItems]);

  return (
    <ItemsContext.Provider value={{ items, fetching, refresh, patchItem }}>
      {children}
    </ItemsContext.Provider>
  );
}

export function useItems() {
  return useContext(ItemsContext);
}
