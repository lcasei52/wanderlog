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
 * 空串/纯空白 → null。航司与到达日期可空，"清空输入框"要落成 NULL 而不是 ""。
 * 不在 places.ts 里导出复用：那是 "use server" 文件，导出必须是 async 函数。
 */
function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * 可手动编辑的字段（航班卡展开后的表单）。
 * 不含机场坐标（arrivalLng/arrivalLat）：那是给"自动挂到当天"的机场地点用的，
 * 而编辑航班刻意**不动**那些地点（由用户在当天列表里自己改/删），改坐标也没有消费方。
 */
export type FlightPatch = Partial<
  Pick<
    NewFlight,
    | "flightNumber"
    | "airline"
    | "from"
    | "fromCity"
    | "fromCode"
    | "date"
    | "departureTime"
    | "to"
    | "toCity"
    | "toCode"
    | "arrivalDate"
    | "arrivalTime"
  >
>;

/**
 * 更新航班：只把**传进来的**字段写进 set()（undefined 的一律不碰），
 * 返回整行供前端替换本地态；没命中返回 null。
 */
export async function updateFlightById(
  id: string,
  patch: FlightPatch
): Promise<Flight | null> {
  const db = getDb();
  const [row] = await db
    .update(flights)
    .set({
      ...(patch.flightNumber !== undefined
        ? { flightNumber: patch.flightNumber }
        : {}),
      ...(patch.airline !== undefined ? { airline: stringOrNull(patch.airline) } : {}),
      ...(patch.from !== undefined ? { from: patch.from } : {}),
      ...(patch.fromCity !== undefined ? { fromCity: patch.fromCity } : {}),
      // 三字码可空：手打的机场没有码，清空要落成 NULL 而不是 ""
      ...(patch.fromCode !== undefined
        ? { fromCode: stringOrNull(patch.fromCode) }
        : {}),
      ...(patch.date !== undefined ? { date: patch.date } : {}),
      ...(patch.departureTime !== undefined
        ? { departureTime: patch.departureTime }
        : {}),
      ...(patch.to !== undefined ? { to: patch.to } : {}),
      ...(patch.toCity !== undefined ? { toCity: patch.toCity } : {}),
      ...(patch.toCode !== undefined ? { toCode: stringOrNull(patch.toCode) } : {}),
      ...(patch.arrivalDate !== undefined
        ? { arrivalDate: stringOrNull(patch.arrivalDate) }
        : {}),
      ...(patch.arrivalTime !== undefined ? { arrivalTime: patch.arrivalTime } : {}),
    })
    .where(eq(flights.id, id))
    .returning();
  if (row) revalidatePath(`/plan/${row.tripId}`);
  return row ?? null;
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
