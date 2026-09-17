"use server";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { days } from "@/db/schema";

/*
 * days 表的 action：写某一天的副标题（DayCard 里那行灰字），加上撤销栈要的整体同步。
 *
 * 和其他所有 action 一样不调 revalidatePath —— 客户端手里有完整副本，
 * 判据见 actions/places.ts 顶部那段。
 */

/**
 * 写某一天的副标题。title 传 null = 抹掉。
 *
 * 找不到这一天的行就补一行：`days` 的行是建行程时按起止日期一次性铺好的
 * （ensureTripDays），之后用户改了行程日期、或者行程建在 days 有 title 之前，
 * 都可能缺行 —— 缺了就直接 UPDATE 不到，表现为"填了副标题、刷新就没了"。
 * 所以这里补写一行，别让它静默失败。
 *
 * position 排在现有各天之后：这个字段只在铺行时按日期顺序写过，除了
 * (trip_id, position) 那个唯一索引，没有任何读取方（各处的"第几天"都是按日期
 * 现算的，见 places-context 的 buildDays）。所以补进来的行排在哪都不影响显示，
 * 只要别撞上唯一索引。取 max+1 的做法跟 places.ts 的 containerMaxPosition 一致。
 */
export async function updateDayTitle(
  tripId: string,
  dayDate: string,
  title: string | null,
): Promise<void> {
  const db = getDb();

  const updated = await db
    .update(days)
    .set({ title })
    .where(and(eq(days.tripId, tripId), eq(days.date, dayDate)))
    .returning({ id: days.id });

  if (updated.length > 0) return;

  const [last] = await db
    .select({ position: days.position })
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(desc(days.position))
    .limit(1);

  // onConflictDoNothing：这一行的日期已经在了（并发、或上面那次 UPDATE 恰好没匹配上）
  await db
    .insert(days)
    .values({
      tripId,
      date: dayDate,
      position: (last?.position ?? -1) + 1,
      title,
    })
    .onConflictDoNothing();
}

/* ============================================================
 * Undo / Redo：整体快照同步（只动 title 这一列）
 * ============================================================ */

/**
 * 把这一行程每天的副标题整体替换成快照里那份。撤销栈调用（history-context 的
 * syncAll），别的地方不用碰。
 *
 * 快照长这样：`{ "2026-09-20": "环球影城日" }` —— 按 dayDate 索引，**只有真写了
 * 副标题的那几天占键**（见 places-context 的 buildDayTitles）。所以"快照里没有这个
 * 日期"读作"这天没有副标题"，要把它改回 null，而不是跳过。
 *
 * 和另外几个 sync* 并发是安全的：days 除 trip_id 外一张外键都不挂，谁先谁后都行。
 * 缺行的日期照样要补行（跟上面那个 action 一样），理由见 updateDayTitle。
 *
 * ⚠️ 有意**不**调 revalidatePath，和上面那个 action 一致，理由见文件头。
 */
export async function syncDayTitlesSnapshot(
  tripId: string,
  titles: Record<string, string>,
): Promise<void> {
  const db = getDb();

  const rows = await db
    .select({
      id: days.id,
      date: days.date,
      title: days.title,
      position: days.position,
    })
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(desc(days.position));

  // 只动真的变了的那几行：一次撤销通常只改了一天，没必要把整列都写一遍
  const changed = rows.filter((r) => (titles[r.date] ?? null) !== r.title);
  if (changed.length > 0) {
    // 逐行 UPDATE（跟 notes 的 reorderNotes 一个路子）：neon-http 没有事务，硬要攒成
    // 一条语句就得写 CASE WHEN，而一程最多几十天 —— 这点复杂度换不来什么
    await Promise.all(
      changed.map((r) =>
        db
          .update(days)
          .set({ title: titles[r.date] ?? null })
          .where(eq(days.id, r.id)),
      ),
    );
  }

  // 快照里有、库里没有行的那些天：补一行
  const missing = Object.entries(titles).filter(
    ([date]) => !rows.some((r) => r.date === date),
  );
  if (missing.length > 0) {
    // rows 按 position 降序，所以头一条就是当前最大的那个；
    // position 排到现有各天之后（这个字段没有读取方，只要别撞唯一索引，见 updateDayTitle）
    const maxPosition = rows[0]?.position ?? -1;
    await db
      .insert(days)
      .values(
        missing.map(([date, title], i) => ({
          tripId,
          date,
          position: maxPosition + 1 + i,
          title,
        })),
      )
      .onConflictDoNothing();
  }
}
