"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { expenses, type Expense, type NewExpense } from "@/db/schema";

/*
 * 本文件所有 action 都不调 revalidatePath。
 *
 * 费用这份数据客户端有完整副本（ExpensesProvider，拿 page.tsx 的 props 只当**初值**），
 * 列表和预算总额都由它自己维护 —— 服务端重渲染一次没人消费，白跑一趟（这个页面一次
 * 渲染要打 8 条查询，每条都是一趟到 Neon 的 HTTPS）。
 *
 * 反过来，这一页上唯一还住在服务端 props 里的是行程预算（trips.budget），所以只剩
 * updateTripBudget 那个 action 还 revalidatePath —— 判据和那条注释都在 actions/trips.ts。
 * notes.ts 和 saveHiddenLayers 早就是这套做法。
 */

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** 新增费用：插入并返回整行 */
export async function createExpense(
  tripId: string,
  data: Omit<NewExpense, "tripId">
): Promise<Expense> {
  const db = getDb();
  const [last] = await db
    .select({ position: expenses.position })
    .from(expenses)
    .where(eq(expenses.tripId, tripId))
    .orderBy(desc(expenses.position))
    .limit(1);
  const [row] = await db
    .insert(expenses)
    .values({ ...data, tripId, position: last ? last.position + 1 : 0 })
    .returning();
  return row;
}

export type ExpensePatch = Partial<
  Pick<
    NewExpense,
    | "amount"
    | "currency"
    | "category"
    | "name"
    | "description"
    | "date"
    | "paidBy"
    | "splitWith"
    | "linkedItemType"
    | "linkedItemId"
    | "position"
  >
>;

/** 更新费用 */
export async function updateExpenseById(
  id: string,
  patch: ExpensePatch
): Promise<Expense | null> {
  const db = getDb();
  const [row] = await db
    .update(expenses)
    .set({
      ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined
        ? { description: stringOrNull(patch.description) }
        : {}),
      ...(patch.date !== undefined ? { date: stringOrNull(patch.date) } : {}),
      ...(patch.paidBy !== undefined ? { paidBy: patch.paidBy } : {}),
      ...(patch.splitWith !== undefined ? { splitWith: patch.splitWith } : {}),
      ...(patch.linkedItemType !== undefined
        ? { linkedItemType: stringOrNull(patch.linkedItemType) }
        : {}),
      ...(patch.linkedItemId !== undefined
        ? { linkedItemId: stringOrNull(patch.linkedItemId) }
        : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
    })
    .where(eq(expenses.id, id))
    .returning();
  return row ?? null;
}

/** 拖拽排序：按传入顺序重写 position */
export async function reorderExpenses(
  tripId: string,
  orderedIds: string[]
): Promise<void> {
  if (orderedIds.length === 0) return;
  const db = getDb();
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(expenses)
        .set({ position: index })
        .where(and(eq(expenses.id, id), eq(expenses.tripId, tripId)))
    )
  );
}

/**
 * 删除费用。
 * 以前先 SELECT 一次只为拿 tripId 去 revalidate，现在一条 DELETE 就够 ——
 * 删一个不存在的 id 本来就是空操作，幂等不靠那次查询。
 */
export async function deleteExpenseById(id: string): Promise<void> {
  await getDb().delete(expenses).where(eq(expenses.id, id));
}

/**
 * 删除挂在某个行程项目（航班/住宿/地点）上的费用，父记录被删时跟着走。
 *
 * 为什么该跟着走：这笔钱是**从那张卡上**记的（点卡片上的「添加费用」），
 * 卡片上的金额只是费用的视图 —— 卡没了，视图也没了，剩一条挂在已删除项目上的
 * 费用只会让预算里多出一条谁也解释不清的「航班」。
 *
 * 和 deletePlaceItemsBySource 一样是一发 DELETE 走人：不用先 SELECT 确认存在
 * （删不存在的行是空操作），也不用 .returning() 拿 tripId 去 revalidate。
 */
export async function deleteExpensesByLinkedItem(
  linkedItemType: string,
  linkedItemId: string
): Promise<void> {
  await getDb()
    .delete(expenses)
    .where(
      and(
        eq(expenses.linkedItemType, linkedItemType),
        eq(expenses.linkedItemId, linkedItemId)
      )
    );
}

/* ============================================================
 * Undo / Redo：整体快照同步（只同步这一张表）
 * ============================================================ */

/**
 * 把 trip 的 expenses 整体替换成快照里的状态。撤销栈调用，别的地方不用碰。
 *
 * 为什么费用也得进快照：删地点卡/删航班时，挂在它上面的那笔账是级联删掉的
 * （见 deleteExpenseById 的兄弟函数和 places.ts 的 deletePlaceItem），不带上的话
 * 撤销就成了"地点回来了、预算里那笔账没了"。
 *
 * 和 place_items 之间没有外键（linked_item_id 只是个 text），所以这里和
 * syncPlacesSnapshot 完全可以并发发出去，谁先谁后都行。
 *
 * ⚠️ 快照里若有费用挂在**已被删掉的成员**上，这一段会整体失败（paid_by 是
 * restrict 外键）—— 由调用方 catch 住提示用户，撤销不掉，也好过悄悄把账写错。
 * 这也是成员不进快照的硬理由之一。
 */
export async function syncExpensesSnapshot(
  tripId: string,
  snapshot: Expense[]
): Promise<void> {
  const db = getDb();

  const snapIds = snapshot.map((ex) => ex.id);
  const existing = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.tripId, tripId));
  const toDelete = existing
    .filter((ex) => !snapIds.includes(ex.id))
    .map((ex) => ex.id);
  if (toDelete.length > 0) {
    await db.delete(expenses).where(inArray(expenses.id, toDelete));
  }

  // 整批一条语句；createdAt 有意不写（新插的走默认值，已存在的保持原来那一刻）
  if (snapshot.length > 0) {
    await db
      .insert(expenses)
      .values(
        snapshot.map((ex) => ({
          id: ex.id,
          tripId,
          amount: ex.amount,
          currency: ex.currency,
          category: ex.category,
          name: ex.name,
          description: ex.description,
          date: ex.date,
          paidBy: ex.paidBy,
          splitWith: ex.splitWith,
          linkedItemType: ex.linkedItemType,
          linkedItemId: ex.linkedItemId,
          position: ex.position,
        }))
      )
      .onConflictDoUpdate({
        target: expenses.id,
        set: {
          amount: sql`excluded.amount`,
          currency: sql`excluded.currency`,
          category: sql`excluded.category`,
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          date: sql`excluded.date`,
          paidBy: sql`excluded.paid_by`,
          splitWith: sql`excluded.split_with`,
          linkedItemType: sql`excluded.linked_item_type`,
          linkedItemId: sql`excluded.linked_item_id`,
          position: sql`excluded.position`,
        },
      });
  }
}
