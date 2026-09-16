"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { flights, type Flight, type NewFlight } from "@/db/schema";
import { deletePlaceItemsBySource } from "@/actions/places";
import { deleteExpensesByLinkedItem } from "@/actions/expenses";

/*
 * 本文件所有 action 都不调 revalidatePath。
 * 航班这份数据客户端有完整副本（BookingsProvider，拿 page.tsx 的 props 只当**初值**），
 * 列表顺序、卡片上的费用都由它自己维护 —— 服务端重渲染一次没人消费，白跑一趟
 * （这个页面一次渲染要打 8 条查询，每条都是一趟到 Neon 的 HTTPS）。
 * 判据和详细理由见 actions/trips.ts 里 updateTripBudget 上方那段。
 */

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
}

/**
 * 删除航班：按行 id 删除，并级联删掉两样跟着它的东西 ——
 *  - 它自动生成的地点实例（sourceKind='flight' + 该 id；出发/到达机场各一份）；
 *  - 记在它上面的费用（linkedItemType='flight' + 该 id），否则预算里会留下一条
 *    挂在已删航班上的「航班」费用。
 *
 * 两个级联互不依赖，并发发出去：到 Neon 一趟往返一两秒，串行是相加、并发取最大。
 * 这里三个删除都不 revalidatePath：这一屏的真源是 BookingsProvider 的本地态，
 * 服务端那份渲染结果只在下次首屏播种时用一次，而下次首屏本来就重新查（见文件顶部）。
 */
export async function deleteFlightById(id: string): Promise<void> {
  await getDb().delete(flights).where(eq(flights.id, id));
  await Promise.all([
    deletePlaceItemsBySource("flight", id),
    deleteExpensesByLinkedItem("flight", id),
  ]);
}

/* ============================================================
 * Undo / Redo：整体快照同步（只同步这一张表）
 * ============================================================ */

/**
 * 把 trip 的 flights 整体替换成快照里的状态。撤销栈调用，别的地方不用碰。
 *
 * 和住宿拆成两个 action 是安全的：flights / hotels 之间没有外键（机场地点、费用
 * 都只是按 id 松散引用），所以两者可以并发发出去。反例见 syncPlacesSnapshot 上那段
 * ——items 和 lists 拆开就会撞外键。
 *
 * ⚠️ 复原一趟被删的航班**不会**顺便把它的机场地点和费用带回来：那两样在数据库里
 * 没有外键指向 flights（见 deleteFlightById 的说明），级联是那一处代码手写的。
 * 它们由同一份快照的 places / expenses 两片负责，这就是快照必须装全的原因。
 */
export async function syncFlightsSnapshot(
  tripId: string,
  snapshot: Flight[]
): Promise<void> {
  const db = getDb();

  const snapIds = snapshot.map((f) => f.id);
  const existing = await db
    .select({ id: flights.id })
    .from(flights)
    .where(eq(flights.tripId, tripId));
  const toDelete = existing.filter((f) => !snapIds.includes(f.id)).map((f) => f.id);
  if (toDelete.length > 0) {
    await db.delete(flights).where(inArray(flights.id, toDelete));
  }

  // 整批一条语句（Drizzle 把数组展开成多行 VALUES，冲突时用 excluded = 本次想插的值）；
  // createdAt 有意不写：新插的走默认值，已存在的保持原来那一刻。
  if (snapshot.length > 0) {
    await db
      .insert(flights)
      .values(
        snapshot.map((f) => ({
          id: f.id,
          tripId,
          from: f.from,
          fromCity: f.fromCity,
          fromCode: f.fromCode,
          to: f.to,
          toCity: f.toCity,
          toCode: f.toCode,
          date: f.date,
          departureTime: f.departureTime,
          arrivalTime: f.arrivalTime,
          flightNumber: f.flightNumber,
          airline: f.airline,
          position: f.position,
          arrivalDate: f.arrivalDate,
          arrivalLng: f.arrivalLng,
          arrivalLat: f.arrivalLat,
        }))
      )
      .onConflictDoUpdate({
        target: flights.id,
        set: {
          from: sql`excluded.from`,
          fromCity: sql`excluded.from_city`,
          fromCode: sql`excluded.from_code`,
          to: sql`excluded.to`,
          toCity: sql`excluded.to_city`,
          toCode: sql`excluded.to_code`,
          date: sql`excluded.date`,
          departureTime: sql`excluded.departure_time`,
          arrivalTime: sql`excluded.arrival_time`,
          flightNumber: sql`excluded.flight_number`,
          airline: sql`excluded.airline`,
          position: sql`excluded.position`,
          arrivalDate: sql`excluded.arrival_date`,
          arrivalLng: sql`excluded.arrival_lng`,
          arrivalLat: sql`excluded.arrival_lat`,
        },
      });
  }
}
