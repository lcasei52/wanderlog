"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { hotels, type Hotel, type NewHotel } from "@/db/schema";
import { deletePlaceItemsBySource } from "@/actions/places";

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
  revalidatePath(`/plan/${tripId}`);
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
  if (row) revalidatePath(`/plan/${row.tripId}`);
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
  revalidatePath(`/plan/${tripId}`);
}

/**
 * 删除住宿：按行 id 删除，并级联删除它自动生成的地点实例
 * （sourceKind='hotel' + 该 id；入住→退房每天的首/尾份都会一起删）。
 */
export async function deleteHotelById(id: string): Promise<void> {
  await getDb().delete(hotels).where(eq(hotels.id, id));
  await deletePlaceItemsBySource("hotel", id);
}
