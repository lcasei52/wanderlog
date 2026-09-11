"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { flights, type Flight, type NewFlight } from "@/db/schema";
import { deletePlaceItemsBySource } from "@/actions/places";

/**
 * 新增航班：插入 flights 表并返回带 uuid 的整行，供前端直接追加到列表。
 * data 不含 tripId（由这里的入参单独提供，避免调用方重复）。
 * position 取该行程当前最大值 +1 —— 列表按 position 排序，新航班永远排在末尾。
 */
export async function createFlight(
  tripId: string,
  data: Omit<NewFlight, "tripId">
): Promise<Flight> {
  const db = getDb();
  const [last] = await db
    .select({ position: flights.position })
    .from(flights)
    .where(eq(flights.tripId, tripId))
    .orderBy(desc(flights.position))
    .limit(1);
  const [row] = await db
    .insert(flights)
    .values({ ...data, tripId, position: last ? last.position + 1 : 0 })
    .returning();
  revalidatePath(`/plan/${tripId}`);
  return row;
}

/**
 * 拖拽排序：按传入顺序把 position 重写成 0..n-1。
 * 只更新属于该行程的行（防止越权改到别人的行程）。
 */
export async function reorderFlights(
  tripId: string,
  orderedIds: string[]
): Promise<void> {
  if (orderedIds.length === 0) return;
  const db = getDb();
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(flights)
        .set({ position: index })
        .where(and(eq(flights.id, id), eq(flights.tripId, tripId)))
    )
  );
  revalidatePath(`/plan/${tripId}`);
}

/**
 * 删除航班：按行 id 删除，并级联删除它自动生成的地点实例
 * （sourceKind='flight' + 该 id；出发点/到达点机场各一份都会一起删）。
 * trip 页面是本会话内的客户端 state 即时更新的，这里 revalidate 只是保证
 * 未来任何一次服务端渲染读到的是删除后的数据。
 */
export async function deleteFlightById(id: string): Promise<void> {
  await getDb().delete(flights).where(eq(flights.id, id));
  await deletePlaceItemsBySource("flight", id);
}
