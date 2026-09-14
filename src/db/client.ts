import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

/*
 * 这里用的是 neon-http 驱动，它决定了本项目的性能特征，值得先记住：
 * **每次查询就是一个独立的 HTTPS 请求 —— 没有持久连接、没有连接池、没有 TCP 握手。**
 *
 * 由此推出三条，别记反了：
 *   1. 不存在"连接数上限"要躲。Neon 的 pooler 能接 1 万个客户端连接，直连也有
 *      104 个。几个查询之间没有依赖时，尽管 Promise.all 并发（actions/notes.ts
 *      的 reorderNotes 就一直这么写）。
 *   2. 单次查询的固定开销是"一趟到 Neon 的往返"，不是"建立连接"。所以省开销的
 *      方向是**减少查询次数**（少查、合并、缓存），不是把查询串起来。
 *   3. 这条链路会整趟连接超时（本机到 Neon 不稳，见下）。失败时是
 *      ConnectTimeoutError、10 秒超时，重试一次常常就好 —— 不是查询写错了。
 *
 * 另外 neon-http 不支持事务（drizzle 这层没有 transaction API）：一次要写多行
 * 只能 Promise.all 逐条发出去，靠主键/唯一约束兜住幂等。
 */

// 懒初始化：真正被查询时才读 DATABASE_URL 建客户端，
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
