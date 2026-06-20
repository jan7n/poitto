"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AppHeader({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function handleLogout() {
    // Clear per-session chat history so the next user starts fresh
    localStorage.removeItem("poitto-chat-v1");
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[60%]">
          {email}
        </span>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 transition-colors dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          ログアウト
        </button>
      </div>
    </header>
  );
}
