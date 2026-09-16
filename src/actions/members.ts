"use server";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tripMembers, type TripMember, type NewTripMember } from "@/db/schema";
import { SELF_MEMBER_EMAIL } from "@/db/trip-members";

/*
 * 本文件所有 action 都不调 revalidatePath。
 * 成员这份数据客户端有完整副本（MembersProvider，拿 page.tsx 的 props 只当**初值**），
 * 那个 props（tripMembers）除了播种没有第二个读者 —— 服务端重渲染一次没人消费。
 * 判据和详细理由见 actions/trips.ts 里 updateTripBudget 上方那段。
 */

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** 新增成员：插入并返回整行 */
export async function createMember(
  tripId: string,
  data: Omit<NewTripMember, "tripId">
): Promise<TripMember> {
  const db = getDb();
  const [last] = await db
    .select({ position: tripMembers.position })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId))
    .orderBy(desc(tripMembers.position))
    .limit(1);
  const [row] = await db
    .insert(tripMembers)
    .values({ ...data, tripId, position: last ? last.position + 1 : 0 })
    .returning();
  return row;
}

export type MemberPatch = Partial<
  Pick<NewTripMember, "displayName" | "avatar" | "position">
>;

/** 更新成员信息 */
export async function updateMemberById(
  id: string,
  patch: MemberPatch
): Promise<TripMember | null> {
  const db = getDb();
  const [row] = await db
    .update(tripMembers)
    .set({
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.avatar !== undefined ? { avatar: stringOrNull(patch.avatar) } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
    })
    .where(eq(tripMembers.id, id))
    .returning();
  return row ?? null;
}

/** 拖拽排序：按传入顺序重写 position */
export async function reorderMembers(
  tripId: string,
  orderedIds: string[]
): Promise<void> {
  if (orderedIds.length === 0) return;
  const db = getDb();
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(tripMembers)
        .set({ position: index })
        .where(and(eq(tripMembers.id, id), eq(tripMembers.tripId, tripId)))
    )
  );
}

/** 删除成员（注意：有关联费用时会被 restrict 阻止） */
export async function deleteMemberById(id: string): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ email: tripMembers.email })
    .from(tripMembers)
    .where(eq(tripMembers.id, id))
    .limit(1);
  if (!existing) return;
  /*
   * 「我」不能删：删掉之后行程又没有成员了，expenses.paid_by 这个 notNull 外键
   * 无值可填，一笔费用都记不了 —— 正是 ensureTripSelfMember 要保证的事。
   * paid_by 的 onDelete: restrict 只在「我」名下有费用时才拦得住。
   *
   * 这里**必须抛**，不能静默返回：members-context 的 deleteMember 是
   * "action 成功后 setMembers(filter)"，静默返回会让本地状态把「我」滤掉、
   * 库里还在，当场复现那个 bug。
   */
  if (existing.email === SELF_MEMBER_EMAIL) {
    throw new Error("「我」是行程的默认成员，不能删除");
  }
  // 删不存在的行是空操作，所以这里不必再确认一次
  await db.delete(tripMembers).where(eq(tripMembers.id, id));
}
