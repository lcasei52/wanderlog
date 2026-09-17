/**
 * 建表脚本：给火车功能建 `trains` 表。
 * 运行：npx tsx src/db/trains-ddl.ts
 *
 * 为什么是手写 DDL：本项目没有 migration —— drizzle.config.ts 指向的 ./drizzle 目录
 * 不存在、全库没有任何 .sql 文件、源码里也没有一处 .execute()，表结构真正的定义处只有
 * schema.ts 的 pgTable，而 pgTable 不能重放。drizzle-kit push 在本机到 Neon 这条链路
 * 上又会整趟挂住（连接间歇性超时，见 db/client.ts）。所以建表就照 seed.ts 的样子写成
 * 一次性脚本，跑完**保留** —— 它是这张表唯一可重放的记录。
 *
 * 可**重复执行**：语句都是 IF NOT EXISTS。结尾那句 SELECT 是冒烟测试，建完当场确认
 * 这张表真的能查 —— Neon 的连接抖动会制造出"命令成功、表没建上"这种假象。
 *
 * 重试自己写、**不复用 db/retry.ts 的 withRetry**：那个 helper 明确写了"只用于读"，
 * 因为普通写被重放会插出重复行、而失败发生在发出前还是发出后在这一层分辨不出来。
 * CREATE TABLE IF NOT EXISTS 没有这个问题（重放幂等），但也不该去把 withRetry 的承诺
 * 改宽 —— 所以这里只借它导出的 isConnectFailure 当判据。
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { getDb } from "./client";
import { isConnectFailure } from "./retry";

config({ path: ".env.local" });

/**
 * 列与 schema.ts 的 trains 一一对应，改那边记得回来改这里。
 *
 * 两点与 flights 刻意的不同：① 没有 arrival_lng / arrival_lat —— 那两列在 flights 里
 * 只是把 API 查回的坐标捎给"到达机场"那张地点卡，而火车的坐标来自高德站点联想，
 * 创建那一刻就在手上，抄过来会变成写一次、没有读取方；② from_city / to_city 是
 * **城市**（flights 的同名列存的是机场名，那是个历史命名错误，别照抄）。
 *
 * 不加索引，与 flights / hotels 保持一致 —— 单方面加会让 schema.ts 和这份 DDL 两份
 * 记录打架。
 */
const STATEMENTS = [
  sql`
    CREATE TABLE IF NOT EXISTS trains (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      train_number text NOT NULL,
      from_station text NOT NULL,
      from_city text,
      to_station text NOT NULL,
      to_city text,
      date text NOT NULL,
      departure_time text NOT NULL,
      arrival_date text,
      arrival_time text NOT NULL,
      position integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `,
];

/** 连接失败重试；SQL 本身写错（列名拼错之类）立刻抛出来，重试只会把真问题盖住 */
async function executeWithRetry(statement: ReturnType<typeof sql>) {
  const db = getDb();
  for (let attempt = 1; ; attempt++) {
    try {
      await db.execute(statement);
      return;
    } catch (error) {
      if (attempt >= 3 || !isConnectFailure(error)) throw error;
      console.warn(
        `Neon 连接失败，第 ${attempt} 次重试：`,
        error instanceof Error ? error.cause ?? error.message : error,
      );
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}

async function run() {
  for (const statement of STATEMENTS) {
    await executeWithRetry(statement);
  }
  const result = await getDb().execute(
    sql`SELECT count(*)::int AS n FROM trains`,
  );
  console.log("DDL 完成：trains，当前", result.rows[0]?.n ?? 0, "行");
}

run().catch((error) => {
  console.error("DDL 失败：", error);
  process.exit(1);
});
