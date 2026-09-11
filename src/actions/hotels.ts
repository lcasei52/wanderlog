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
