"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { trains, type NewTrain, type Train } from "@/db/schema";
import { deletePlaceItemsBySource } from "@/actions/places";
import { deleteExpensesByLinkedItem } from "@/actions/expenses";

/*
 * 本文件所有 action 都不调 revalidatePath。
 * 火车这份数据客户端有完整副本（BookingsProvider 的第三片，拿 page.tsx 的 props 只当
 * **初值**），列表顺序、卡片上的费用都由它自己维护 —— 服务端重渲染一次没人消费，白跑
 * 一趟（这个页面一次渲染要打 9 条查询，每条都是一趟到 Neon 的 HTTPS）。
 * 判据和详细理由见 actions/trips.ts 里 updateTripBudget 上方那段。
 */

/**
 * 新增火车：插入 trains 表并返回带 uuid 的整行，供前端直接追加到列表。
 * data 不含 tripId（由这里的入参单独提供，避免调用方重复）。
 * position 取该行程当前最大值 +1 —— 列表按 position 排序，新火车永远排在末尾。
 */
export async function createTrain(
  tripId: string,
  data: Omit<NewTrain, "tripId">
): Promise<Train> {
  const db = getDb();
  const [last] = await db
    .select({ position: trains.position })
    .from(trains)
    .where(eq(trains.tripId, tripId))
    .orderBy(desc(trains.position))
    .limit(1);
  const [row] = await db
    .insert(trains)
    .values({ ...data, tripId, position: last ? last.position + 1 : 0 })
    .returning();
  return row;
}

/**
 * 空串/纯空白 → null。城市可空，"清空输入框"要落成 NULL 而不是 ""。
 * 不在 places.ts 里导出复用：那是 "use server" 文件，导出必须是 async 函数。
 */
function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * 可手动编辑的字段（火车卡展开后的表单）。
 * 不含坐标：火车没有 arrivalLng/arrivalLat 那两列（理由见 schema.ts 的 trains 注释），
 * 而编辑火车刻意**不动**自动挂出的站点卡（由用户在当天列表里自己改/删）。
 */
export type TrainPatch = Partial<
  Pick<
    NewTrain,
    | "trainNumber"
    | "fromStation"
    | "fromCity"
    | "toStation"
    | "toCity"
    | "date"
    | "departureTime"
    | "arrivalDate"
    | "arrivalTime"
  >
>;

/**
 * 更新火车：只把**传进来的**字段写进 set()（undefined 的一律不碰），
 * 返回整行供前端替换本地态；没命中返回 null。
 */
export async function updateTrainById(
  id: string,
  patch: TrainPatch
): Promise<Train | null> {
  const db = getDb();
  const [row] = await db
    .update(trains)
    .set({
      ...(patch.trainNumber !== undefined
        ? { trainNumber: patch.trainNumber }
        : {}),
      ...(patch.fromStation !== undefined
        ? { fromStation: patch.fromStation }
        : {}),
      // 城市可空：只打了站名、没走高德联想的就没有城市，清空要落成 NULL 而不是 ""
      ...(patch.fromCity !== undefined
        ? { fromCity: stringOrNull(patch.fromCity) }
        : {}),
      ...(patch.toStation !== undefined ? { toStation: patch.toStation } : {}),
      ...(patch.toCity !== undefined ? { toCity: stringOrNull(patch.toCity) } : {}),
      ...(patch.date !== undefined ? { date: patch.date } : {}),
      ...(patch.departureTime !== undefined
        ? { departureTime: patch.departureTime }
        : {}),
      ...(patch.arrivalDate !== undefined
        ? { arrivalDate: stringOrNull(patch.arrivalDate) }
        : {}),
      ...(patch.arrivalTime !== undefined ? { arrivalTime: patch.arrivalTime } : {}),
    })
    .where(eq(trains.id, id))
    .returning();
  return row ?? null;
}

/**
 * 拖拽排序：按传入顺序把 position 重写成 0..n-1。
 * 只更新属于该行程的行（防止越权改到别人的行程）。
 */
export async function reorderTrains(
  tripId: string,
  orderedIds: string[]
): Promise<void> {
  if (orderedIds.length === 0) return;
  const db = getDb();
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(trains)
        .set({ position: index })
        .where(and(eq(trains.id, id), eq(trains.tripId, tripId)))
    )
  );
}

/**
 * 删除火车：按行 id 删除，并级联删掉两样跟着它的东西 ——
 *  - 它自动生成的地点实例（sourceKind='train' + 该 id；上车站/下车站各一份）；
 *  - 记在它上面的费用（linkedItemType='train' + 该 id），否则预算里会留下一条
 *    挂在已删火车上的「公共交通」费用。
 *
 * 两个级联互不依赖，并发发出去：到 Neon 一趟往返一两秒，串行是相加、并发取最大。
 * 这里三个删除都不 revalidatePath：这一屏的真源是 BookingsProvider 的本地态，
 * 服务端那份渲染结果只在下次首屏播种时用一次，而下次首屏本来就重新查（见文件顶部）。
 */
export async function deleteTrainById(id: string): Promise<void> {
  await getDb().delete(trains).where(eq(trains.id, id));
  await Promise.all([
    deletePlaceItemsBySource("train", id),
    deleteExpensesByLinkedItem("train", id),
  ]);
}

/* ============================================================
 * Undo / Redo：整体快照同步（只同步这一张表）
 * ============================================================ */

/**
 * 把 trip 的 trains 整体替换成快照里的状态。撤销栈调用，别的地方不用碰。
 *
 * 和 flights / hotels 三个并发发出去是安全的：这三张表之间没有外键（机场/站点地点、
 * 费用都只是按 id 松散引用）。反例见 syncPlacesSnapshot 上那段 —— items 和 lists
 * 拆开就会撞外键。
 *
 * ⚠️ 复原一趟被删的火车**不会**顺便把它的站点卡和费用带回来：那两样在数据库里没有
 * 外键指向 trains（见 deleteTrainById 的说明），级联是那一处代码手写的。它们由同一份
 * 快照的 places / expenses 两片负责，这就是快照必须装全的原因。
 */
export async function syncTrainsSnapshot(
  tripId: string,
  snapshot: Train[]
): Promise<void> {
  const db = getDb();

  const snapIds = snapshot.map((t) => t.id);
  const existing = await db
    .select({ id: trains.id })
    .from(trains)
    .where(eq(trains.tripId, tripId));
  const toDelete = existing.filter((t) => !snapIds.includes(t.id)).map((t) => t.id);
  if (toDelete.length > 0) {
    await db.delete(trains).where(inArray(trains.id, toDelete));
  }

  // 整批一条语句（Drizzle 把数组展开成多行 VALUES，冲突时用 excluded = 本次想插的值）；
  // createdAt 有意不写：新插的走默认值，已存在的保持原来那一刻。
  if (snapshot.length > 0) {
    await db
      .insert(trains)
      .values(
        snapshot.map((t) => ({
          id: t.id,
          tripId,
          trainNumber: t.trainNumber,
          fromStation: t.fromStation,
          fromCity: t.fromCity,
          toStation: t.toStation,
          toCity: t.toCity,
          date: t.date,
          departureTime: t.departureTime,
          arrivalDate: t.arrivalDate,
          arrivalTime: t.arrivalTime,
          position: t.position,
        }))
      )
      .onConflictDoUpdate({
        target: trains.id,
        set: {
          trainNumber: sql`excluded.train_number`,
          fromStation: sql`excluded.from_station`,
          fromCity: sql`excluded.from_city`,
          toStation: sql`excluded.to_station`,
          toCity: sql`excluded.to_city`,
          date: sql`excluded.date`,
          departureTime: sql`excluded.departure_time`,
          arrivalDate: sql`excluded.arrival_date`,
          arrivalTime: sql`excluded.arrival_time`,
          position: sql`excluded.position`,
        },
      });
  }
}
