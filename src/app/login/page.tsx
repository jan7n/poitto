"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("確認メールを送信しました。メールを確認してからログインしてください。");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "エラーが発生しました。";
      setError(translateError(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-800">ポイッと</h1>
          <p className="mt-1.5 text-sm text-stone-400">AIが整理してくれるメモ帳</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-stone-200 bg-white px-6 py-7">
          {/* Mode tabs */}
          <div className="mb-6 flex gap-0 border-b border-stone-100">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); setMessage(null); }}
                className={`flex-1 pb-2.5 text-sm transition-colors ${
                  mode === m
                    ? "border-b-2 border-stone-800 font-medium text-stone-800"
                    : "text-stone-400 hover:text-stone-600"
                }`}
                style={{ marginBottom: "-1px" }}
              >
                {m === "login" ? "ログイン" : "新規登録"}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-stone-500">メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 placeholder-stone-300 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-stone-500">パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="6文字以上"
                minLength={6}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 placeholder-stone-300 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-100"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</p>
            )}
            {message && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{message}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-stone-800 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-40"
            >
              {loading ? "処理中..." : mode === "login" ? "ログイン" : "アカウントを作成"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials"))
    return "メールアドレスまたはパスワードが正しくありません。";
  if (msg.includes("Email not confirmed"))
    return "メールアドレスが未確認です。確認メールをご確認ください。";
  if (msg.includes("User already registered"))
    return "このメールアドレスはすでに登録されています。";
  if (msg.includes("Password should be at least"))
    return "パスワードは6文字以上で入力してください。";
  return msg;
}
