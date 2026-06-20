"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AppHeader({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function handleLogout() {
    localStorage.removeItem("poitto-chat-v1");
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-[#F5F4EF] border-b border-stone-200"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 h-10">
        <span className="text-xs text-stone-400 truncate max-w-[60%]">{email}</span>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="text-xs text-stone-400 hover:text-stone-600 transition-colors px-2 py-1"
        >
          ログアウト
        </button>
      </div>
    </header>
  );
}
