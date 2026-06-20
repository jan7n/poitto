import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ポイッと",
    short_name: "ポイッと",
    description: "AIが整理してくれる、気軽なスケジュール管理",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5F4EF",
    theme_color: "#F5F4EF",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
