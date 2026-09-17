/**
 * 建列脚本：给 trips 加 `container_colors`（各地点列表 / 各天的主色）。
 * 运行：npx tsx src/db/trips-colors-ddl.ts
 *
 * 为什么是手写 DDL：本项目没有 migration —— drizzle.config.ts 指向的 ./drizzle 目录
 * 不存在、全库没有任何 .sql 文件、源码里也没有一处 .execute()，表结构真正的定义处只有
 * schema.ts 的 pgTable，而 pgTable 不能重放。drizzle-kit push 在本机到 Neon 这条链路
 * 上又会整趟挂住（连接间歇性超时，见 db/client.ts）。所以照 seed.ts / trains-ddl.ts 的
 * 样子写成一次性脚本，跑完**保留** —— 它是这一列唯一可重放的记录。
 *
 * 可**重复执行**：ALTER TABLE ADD COLUMN IF NOT EXISTS。结尾那句 SELECT 是冒烟测试，
 * 建完当场确认这一列真的能查 —— Neon 的连接抖动会制造出"命令成功、列没加上"的假象。
 *
 * 重试自己写、**不复用 db/retry.ts 的 withRetry**：那个 helper 明确写了"只用于读"，
 * 因为普通写被重放会插出重复行、而失败发生在发出前还是发出后在这一层分辨不出来。
 * ADD COLUMN IF NOT EXISTS 没有这个问题（重放幂等），但也不该去把 withRetry 的承诺改宽
 * —— 所以这里只借它导出的 isConnectFailure 当判据（跟 trains-ddl.ts 一模一样）。
 *
 * ⚠️ 这一列跑上去之前**不要**改 page.tsx 的 getTripRow：那边一 select 不存在的列，
 * 整个行程页会 500，而"Neon 偶发超时"的既有印象会让人把它误读成连接抖动。
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { getDb } from "./client";
import { isConnectFailure } from "./retry";

config({ path: ".env.local" });

/**
 * 列与 schema.ts 的 trips.containerColors 一一对应，改那边记得回来改这里。
 *
 * 默认值给 '{}'::jsonb 而不是 NULL：读的地方一律当"表里没这个键 = 用默认色"
 * （见 places-context 的 listColor/dayColor），所以空对象和 null 语义上没差别，
 * 但 NOT NULL + 默认值让读的一方少一层判空。
 *
 * PG11+ 的 ADD COLUMN … DEFAULT 是纯元数据操作，不会重写表，几百万行也是瞬时的。
 */
const STATEMENTS = [
  sql`
    ALTER TABLE trips
      ADD COLUMN IF NOT EXISTS container_colors jsonb NOT NULL DEFAULT '{}'::jsonb
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
    sql`SELECT count(*)::int AS n FROM trips WHERE container_colors IS NOT NULL`,
  );
  console.log(
    "DDL 完成：trips.container_colors，当前",
    result.rows[0]?.n ?? 0,
    "行非空",
  );
}

run().catch((error) => {
  console.error("DDL 失败：", error);
  process.exit(1);
});
