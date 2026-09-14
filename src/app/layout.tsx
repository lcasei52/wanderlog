import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/*
 * 不用 next/font/google：它要在编译期访问 fonts.googleapis.com 取字体，
 * 这台机器连不上（curl 跑满 30 秒返回 000），每次 dev 冷启动都会卡在那里。
 * 字体改由 globals.css 的 --app-font-* 系统字体栈提供。
 */

// 标签页图标由 src/app/icon.svg 自动接管（Next 会按文件名识别，不用在这里声明）；
// 原来的 favicon.ico（create-next-app 的默认图标）已删除，留着它会盖过 icon.svg。
export const metadata: Metadata = {
  title: "旅游路线规划小助手",
  description: "旅游路线规划小助手",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
