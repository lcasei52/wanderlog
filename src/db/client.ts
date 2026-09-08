import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// 懒初始化：真正被查询时才读 DATABASE_URL 并建立连接，
// 避免模块加载阶段因为缺少环境变量就直接抛错。
let _db: ReturnType<typeof initDb> | undefined;

function initDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("未配置 DATABASE_URL（请在 .env.local 中设置）");
  }
  return drizzle(neon(url));
}

export function getDb() {
  return (_db ??= initDb());
}
