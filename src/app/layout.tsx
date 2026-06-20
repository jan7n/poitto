import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";
import { ItemsProvider } from "@/components/ItemsProvider";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ポイッと",
  description: "AIが整理してくれる、気軽なメモ・スケジュール管理",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient();
  // getSession() reads from cookie without a network round-trip (faster than getUser())
  // Security is enforced in each API route via getUser()
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {user ? (
          <ItemsProvider>
            <AppHeader email={user.email ?? ""} />
            <div
              className="flex-1 pt-10"
              style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}
            >
              {children}
            </div>
            <BottomNav />
          </ItemsProvider>
        ) : (
          <div className="flex-1">{children}</div>
        )}
      </body>
    </html>
  );
}
