import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "./client";
import { tripMembers } from "./schema";

/**
 * 「我」这一行的邮箱哨兵值。
 *
 * 本项目没有鉴权，行程归属只能用约定表示：每个行程都有一行 email = 本值、
 * displayName「我」、position 0 的成员。两处代码把 members[0] 当成当前用户
 * （TeamBalanceDialog 的「您的摘要」、ExpenseFormFields 的默认付款人），
 * 所以这一行必须排在所有人前面。
 *
 * **域名故意不带点，别"顺手"补成 me@local.test 之类**：「添加伙伴」的邮箱校验是
 * /^[^\s@]+@[^\s@]+\.[^\s@]+$/（域名必须有 "."），me@local 永远过不了那道校验，
 * 所以不可能被真人占掉；补上点之后反而是个能输进来撞车的合法邮箱。
 *
 * email 是 notNull、且与 tripId 组成唯一索引，插行必须给个值 —— 复用这个
 * "UI 造不出来"的邮箱，就不用加 is_self 列、不用动 DDL。
 */
export const SELF_MEMBER_EMAIL = "me@local";

/** 「我」的显示名（没有头像，MemberAvatar 取首字正好是「我」） */
export const SELF_MEMBER_NAME = "我";

/**
 * 给行程补上「我」这一行。
 * 幂等：已有这一行则整体跳过。
 *
 * 兼容改造前建的行程 —— 它们只有被邀请的伙伴，甚至一个成员都没有，而
 * expenses.paid_by 是 notNull 外键指向本表，没有成员就一笔费用都记不了。
 *
 * 三步有先后，**不能写成 Promise.all**：UPDATE 若落在 INSERT 之后，
 * 会把刚插好的「我」从 0 顶到 1，正好造出要防的那个乱序。
 *   1. 读一次判断在不在 —— 页面每次渲染都会走到这儿，绝大多数时候到此为止
 *   2. 已有成员整体 +1，给「我」腾出 position 0。直接插 0 的话，老行程里的伙伴
 *      会和「我」并列在 0，排序退化到比 createdAt，谁在前就不确定了
 *   3. 插入「我」
 *
 * 第 2 步排除哨兵自己：两个请求同时走到这时，后到的那个否则会把「我」顶下去。
 * 排除了之后，重复的 +1 只是把伙伴的编号整体抬高，相对顺序不变。
 *
 * 并发靠 (trip_id, email) 唯一索引 + onConflictDoNothing 兜住，不用事务
 * （neon-http 没有事务，见 db/client.ts）。
 *
 * 顺带记一笔：这套"整体 +1 腾位"**只对本表安全** —— trip_members 的 position
 * 没有唯一索引，多行同为 1 的中间态无所谓；lists / days 上有 position 唯一索引，
 * 同样手法照搬过去会在中间态撞唯一约束。
 */
export async function ensureTripSelfMember(tripId: string): Promise<void> {
  const db = getDb();

  const existing = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(
      and(eq(tripMembers.tripId, tripId), eq(tripMembers.email, SELF_MEMBER_EMAIL)),
    )
    .limit(1);

  if (existing.length > 0) return;

  await db
    .update(tripMembers)
    .set({ position: sql`${tripMembers.position} + 1` })
    .where(
      and(eq(tripMembers.tripId, tripId), ne(tripMembers.email, SELF_MEMBER_EMAIL)),
    );

  await db
    .insert(tripMembers)
    .values({
      tripId,
      email: SELF_MEMBER_EMAIL,
      displayName: SELF_MEMBER_NAME,
      position: 0,
    })
    .onConflictDoNothing({ target: [tripMembers.tripId, tripMembers.email] });
}
