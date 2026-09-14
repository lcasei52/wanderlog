import { redirect } from "next/navigation";

// 根路由只是入口：应用真正的首页是 /home。
// 之前这里留着 create-next-app 的模板页（Next.js logo + Deploy Now 按钮），
// 应用里没有任何地方链接到 /，纯属脚手架残留，直接跳走。
export default function RootPage() {
  redirect("/home");
}
