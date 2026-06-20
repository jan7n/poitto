import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";
import { ItemsProvider } from "@/components/ItemsProvider";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "ポイッと",
  description: "AIが整理してくれる、気軽なスケジュール管理",
  appleWebApp: {
    capable: true,
    title: "ポイッと",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F5F4EF",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full flex flex-col">
        {user ? (
          <ItemsProvider>
            <AppHeader email={user.email ?? ""} />
            <div
              className="flex-1"
              style={{
                paddingTop: "calc(40px + env(safe-area-inset-top))",
                paddingBottom: "calc(88px + env(safe-area-inset-bottom))",
              }}
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
