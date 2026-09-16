"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { hotels, type Hotel, type NewHotel } from "@/db/schema";
import { deletePlaceItemsBySource } from "@/actions/places";
import { deleteExpensesByLinkedItem } from "@/actions/expenses";

/*
 * 本文件所有 action 都不调 revalidatePath。
 * 住宿这份数据客户端有完整副本（BookingsProvider，拿 page.tsx 的 props 只当**初值**），
 * 列表顺序、卡片上的费用都由它自己维护 —— 服务端重渲染一次没人消费，白跑一趟
 * （这个页面一次渲染要打 8 条查询，每条都是一趟到 Neon 的 HTTPS）。
 * 判据和详细理由见 actions/trips.ts 里 updateTripBudget 上方那段。
 */

/**
 * 新增住宿：插入 hotels 表并返回带 uuid 的整行。
 * data 不含 tripId（由这里的入参单独提供）。
 * position 取该行程当前最大值 +1 —— 列表按 position 排序，新住宿永远排在末尾。
 */
export async function createHotel(
  tripId: string,
  data: Omit<NewHotel, "tripId">
): Promise<Hotel> {
  const db = getDb();
  const [last] = await db
    .select({ position: hotels.position })
    .from(hotels)
    .where(eq(hotels.tripId, tripId))
    .orderBy(desc(hotels.position))
    .limit(1);
  const [row] = await db
    .insert(hotels)
    .values({ ...data, tripId, position: last ? last.position + 1 : 0 })
    .returning();
  return row;
}

/**
 * 空串/纯空白 → null。地址可空，"清空输入框"要落成 NULL 而不是 ""。
 * 不在 places.ts 里导出复用：那是 "use server" 文件，导出必须是 async 函数。
 */
function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * 可手动编辑的字段（住宿卡展开后的表单）。
 * 不含坐标（lng/lat）：那是给"自动挂到当天"的酒店地点用的，
 * 而编辑住宿刻意**不动**那些地点（由用户在当天列表里自己改/删），改坐标也没有消费方。
 */
export type HotelPatch = Partial<
  Pick<NewHotel, "name" | "address" | "checkIn" | "checkOut" | "checkInDate">
>;

/**
 * 更新住宿：只把**传进来的**字段写进 set()（undefined 的一律不碰），
 * 返回整行供前端替换本地态；没命中返回 null。
 */
export async function updateHotelById(
  id: string,
  patch: HotelPatch
): Promise<Hotel | null> {
  const db = getDb();
  const [row] = await db
    .update(hotels)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.address !== undefined
        ? { address: stringOrNull(patch.address) }
        : {}),
      ...(patch.checkIn !== undefined ? { checkIn: patch.checkIn } : {}),
      ...(patch.checkOut !== undefined ? { checkOut: patch.checkOut } : {}),
      // checkInDate 可空：和 checkIn 同步（当初用来匹配 day），清空要落成 NULL
      ...(patch.checkInDate !== undefined
        ? { checkInDate: stringOrNull(patch.checkInDate) }
        : {}),
    })
    .where(eq(hotels.id, id))
    .returning();
  return row ?? null;
}

/**
 * 拖拽排序：按传入顺序把 position 重写成 0..n-1。
 * 只更新属于该行程的行（防止越权改到别人的行程）。
 */
export async function reorderHotels(
  tripId: string,
  orderedIds: string[]
): Promise<void> {
  if (orderedIds.length === 0) return;
  const db = getDb();
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(hotels)
        .set({ position: index })
        .where(and(eq(hotels.id, id), eq(hotels.tripId, tripId)))
    )
  );
}

/**
 * 删除住宿：按行 id 删除，并级联删掉两样跟着它的东西 ——
 *  - 它自动生成的地点实例（sourceKind='hotel' + 该 id；入住→退房每天的首/尾份）；
 *  - 记在它上面的费用（linkedItemType='hotel' + 该 id），否则预算里会留下一条
 *    挂在已删住宿上的「住宿」费用。
 *
 * 两个级联互不依赖，并发发出去：到 Neon 一趟往返一两秒，串行是相加、并发取最大。
 */
export async function deleteHotelById(id: string): Promise<void> {
  await getDb().delete(hotels).where(eq(hotels.id, id));
  await Promise.all([
    deletePlaceItemsBySource("hotel", id),
    deleteExpensesByLinkedItem("hotel", id),
  ]);
}

/* ============================================================
 * Undo / Redo：整体快照同步（只同步这一张表）
 * ============================================================ */

/**
 * 把 trip 的 hotels 整体替换成快照里的状态。撤销栈调用，别的地方不用碰。
 *
 * 与 syncFlightsSnapshot 并发是安全的（两者之间没有外键），也和 places / expenses
 * 那边的同步并发安全 —— 酒店地点与费用的级联同样是 deleteHotelById 手写的、
 * 库里没有外键，所以复原住宿时它们由同一份快照的另外两片带回来。
 */
export async function syncHotelsSnapshot(
  tripId: string,
  snapshot: Hotel[]
): Promise<void> {
  const db = getDb();

  const snapIds = snapshot.map((h) => h.id);
  const existing = await db
    .select({ id: hotels.id })
    .from(hotels)
    .where(eq(hotels.tripId, tripId));
  const toDelete = existing.filter((h) => !snapIds.includes(h.id)).map((h) => h.id);
  if (toDelete.length > 0) {
    await db.delete(hotels).where(inArray(hotels.id, toDelete));
  }

  if (snapshot.length > 0) {
    await db
      .insert(hotels)
      .values(
        snapshot.map((h) => ({
          id: h.id,
          tripId,
          name: h.name,
          address: h.address,
          checkIn: h.checkIn,
          checkOut: h.checkOut,
          position: h.position,
          checkInDate: h.checkInDate,
          lng: h.lng,
          lat: h.lat,
        }))
      )
      .onConflictDoUpdate({
        target: hotels.id,
        set: {
          name: sql`excluded.name`,
          address: sql`excluded.address`,
          checkIn: sql`excluded.check_in`,
          checkOut: sql`excluded.check_out`,
          position: sql`excluded.position`,
          checkInDate: sql`excluded.check_in_date`,
          lng: sql`excluded.lng`,
          lat: sql`excluded.lat`,
        },
      });
  }
}
