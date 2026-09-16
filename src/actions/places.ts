"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  expenses,
  lists,
  placeItems,
  type List,
  type PlaceItem,
} from "@/db/schema";
import type {
  PlaceContainer,
  PlaceItemInput,
  PlaceItemPatch,
} from "@/types/place";
import { deleteExpensesByLinkedItem } from "@/actions/expenses";

/*
 * 本文件所有 action 都不调 revalidatePath。
 *
 * 地点这份数据客户端有完整副本（PlacesProvider，拿 page.tsx 的 props 只当**初值**），
 * 列表、卡片、以及撤销时的整体替换都由它自己维护 —— 服务端重渲染一次没人消费，
 * 白跑一趟（这个页面一次渲染要打 8 条查询，每条都是一趟到 Neon 的 HTTPS）。
 * 判据和详细理由见 actions/trips.ts 里 updateTripBudget 上方那段。
 */

/* ============================================================
 * 内部工具：取某容器（list / day）内当前最大的 position，新行排在其后。
 * ============================================================ */
async function containerMaxPosition(
  tripId: string,
  container: PlaceContainer
): Promise<number> {
  const db = getDb();
  const cond =
    container.kind === "list"
      ? eq(placeItems.listId, container.listId)
      : eq(placeItems.dayDate, container.dayDate);
  const [last] = await db
    .select({ position: placeItems.position })
    .from(placeItems)
    .where(and(eq(placeItems.tripId, tripId), cond))
    .orderBy(desc(placeItems.position))
    .limit(1);
  return last ? last.position + 1 : 0;
}

/** 把容器写进 place_items 行（list_id 或 day_date 二选一，满足表 CHECK） */
function containerColumns(container: PlaceContainer) {
  return container.kind === "list"
    ? { listId: container.listId, dayDate: null }
    : { listId: null, dayDate: container.dayDate };
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/* ============================================================
 * place_items CRUD
 * ============================================================ */

/** 新增一份地点实例到某容器；opts.atStart = 插到容器开头（原行整体 +1），否则追加末尾 */
export async function addPlaceItem(
  tripId: string,
  container: PlaceContainer,
  input: PlaceItemInput,
  opts?: { atStart?: boolean }
): Promise<PlaceItem> {
  const db = getDb();
  let position: number;
  if (opts?.atStart) {
    const cond =
      container.kind === "list"
        ? eq(placeItems.listId, container.listId)
        : eq(placeItems.dayDate, container.dayDate);
    await db
      .update(placeItems)
      .set({ position: sql`${placeItems.position} + 1` })
      .where(and(eq(placeItems.tripId, tripId), cond));
    position = 0;
  } else {
    position = await containerMaxPosition(tripId, container);
  }
  const [row] = await db
    .insert(placeItems)
    .values({
      tripId,
      ...containerColumns(container),
      position,
      groupKey: stringOrNull(input.groupKey),
      sourceKind: input.sourceKind ?? null,
      sourceId: input.sourceId ?? null,
      name: input.name,
      address: stringOrNull(input.address),
      tel: stringOrNull(input.tel),
      type: stringOrNull(input.type),
      photo: stringOrNull(input.photo),
      lng: typeof input.lng === "number" ? input.lng : null,
      lat: typeof input.lat === "number" ? input.lat : null,
      note: input.note ?? "",
      description: stringOrNull(input.description),
      timeFrom: stringOrNull(input.timeFrom),
      timeTo: stringOrNull(input.timeTo),
      url: stringOrNull(input.url),
      visited: input.visited ?? false,
    })
    .returning();
  return row;
}

/** 更新一份实例的可编辑字段（note/time/url/visited/名称/坐标等） */
export async function updatePlaceItem(
  id: string,
  patch: PlaceItemPatch
): Promise<PlaceItem | null> {
  const db = getDb();
  const [row] = await db
    .update(placeItems)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.address !== undefined ? { address: stringOrNull(patch.address) } : {}),
      ...(patch.tel !== undefined ? { tel: stringOrNull(patch.tel) } : {}),
      ...(patch.type !== undefined ? { type: stringOrNull(patch.type) } : {}),
      ...(patch.photo !== undefined ? { photo: stringOrNull(patch.photo) } : {}),
      ...(patch.lng !== undefined ? { lng: patch.lng } : {}),
      ...(patch.lat !== undefined ? { lat: patch.lat } : {}),
      ...(patch.note !== undefined ? { note: patch.note ?? "" } : {}),
      ...(patch.description !== undefined
        ? { description: stringOrNull(patch.description) }
        : {}),
      ...(patch.timeFrom !== undefined ? { timeFrom: stringOrNull(patch.timeFrom) } : {}),
      ...(patch.timeTo !== undefined ? { timeTo: stringOrNull(patch.timeTo) } : {}),
      ...(patch.url !== undefined ? { url: stringOrNull(patch.url) } : {}),
      ...(patch.visited !== undefined ? { visited: patch.visited } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
      // "到下一个地点怎么走"（间隔那行选的交通方式）；换天/拖动后语义跟着起点卡走
      ...(patch.routeModeToNext !== undefined
        ? { routeModeToNext: stringOrNull(patch.routeModeToNext) }
        : {}),
    })
    .where(eq(placeItems.id, id))
    .returning();
  return row ?? null;
}

/**
 * 拖拽排序：把同一容器内的实例按传入顺序重写 position（= 下标 0..n-1）。
 * 调用方传的是该容器渲染出的完整 id 列表，所以不会影响其它容器的相对顺序。
 */
export async function reorderPlaceItems(
  tripId: string,
  orderedIds: string[]
): Promise<void> {
  if (orderedIds.length === 0) return;
  const db = getDb();
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(placeItems)
        .set({ position: index })
        .where(and(eq(placeItems.id, id), eq(placeItems.tripId, tripId)))
    )
  );
}

/**
 * 删除一份实例（只删这一份，其它容器里的副本不受影响）。
 *
 * 挂在**这一份**上的费用跟着走：它可能是从这张卡上记的，也可能是在预算里
 * 「从您的行程中选择」挑到这一份记的 —— 两种入库后长得一模一样
 * （linkedItemType='place' + 本行 id），都该随它消失，不该在预算里留一条
 * 挂在已删地点上的账。别的副本 id 不同，不受影响。
 */
export async function deletePlaceItem(id: string): Promise<void> {
  // 两处互不依赖，并发发出去（到 Neon 一趟往返一两秒，串行是相加）。
  // 不再先 SELECT 一次拿 tripId —— 那是给 revalidatePath 用的；删不存在的行本来就是
  // 空操作，幂等不需要靠那次查询。
  await Promise.all([
    getDb().delete(placeItems).where(eq(placeItems.id, id)),
    deleteExpensesByLinkedItem("place", id),
  ]);
}

/**
 * 删除某父记录（航班/酒店）自动生成的绑定实例（source_kind + source_id）。
 *
 * 这些实例上记过的费用也要一起删（跟 deletePlaceItem 同一条规矩）：机场/酒店
 * 那几行在当天列表里也是完整的地点卡，可以点「添加费用」，删航班时它们会跟着
 * 消失，留下的费用就成了挂在已删地点上的孤儿。一次 inArray 删掉，不逐个发。
 */
export async function deletePlaceItemsBySource(
  sourceKind: string,
  sourceId: string
): Promise<void> {
  const db = getDb();
  const removed = await db
    .delete(placeItems)
    .where(
      and(
        eq(placeItems.sourceKind, sourceKind),
        eq(placeItems.sourceId, sourceId)
      )
    )
    .returning({ id: placeItems.id });
  if (removed.length === 0) return;

  await db
    .delete(expenses)
    .where(
      and(
        eq(expenses.linkedItemType, "place"),
        inArray(
          expenses.linkedItemId,
          removed.map((r) => r.id)
        )
      )
    );
}

/**
 * 复制实例到另一容器（"让该地点也出现在 XX 图层"）。
 * 身份字段照抄，可编辑字段（note/时间/附件/已访问）与自动生成来源也一并复制（副本随后可独立编辑）。
 */
export async function copyPlaceItem(
  itemId: string,
  targetContainer: PlaceContainer
): Promise<PlaceItem | null> {
  const db = getDb();
  const [source] = await db
    .select()
    .from(placeItems)
    .where(eq(placeItems.id, itemId))
    .limit(1);
  if (!source) return null;

  const position = await containerMaxPosition(source.tripId, targetContainer);
  const [row] = await db
    .insert(placeItems)
    .values({
      tripId: source.tripId,
      ...containerColumns(targetContainer),
      position,
      groupKey: source.groupKey,
      sourceKind: source.sourceKind ?? null,
      sourceId: source.sourceId ?? null,
      name: source.name,
      address: source.address,
      tel: source.tel,
      type: source.type,
      photo: source.photo,
      lng: source.lng,
      lat: source.lat,
      note: source.note ?? "",
      // 简介也跟着副本走：它是"这个地方是什么"的资料，换个图层看还是同一个地方
      description: source.description,
      timeFrom: source.timeFrom,
      timeTo: source.timeTo,
      url: source.url,
      visited: source.visited,
      // routeModeToNext 故意不复制：那是"它和**下一个**地点之间"的属性，
      // 副本落在别的容器里，下一个地点多半是别人，抄过去反而是错的
    })
    .returning();
  return row;
}

/** 删除某容器下的全部实例（删列表/跨天清理用） */
export async function deletePlaceItemsInContainer(
  tripId: string,
  container: PlaceContainer
): Promise<void> {
  const db = getDb();
  const cond =
    container.kind === "list"
      ? and(eq(placeItems.tripId, tripId), eq(placeItems.listId, container.listId))
      : and(eq(placeItems.tripId, tripId), eq(placeItems.dayDate, container.dayDate));
  await db.delete(placeItems).where(cond);
}

/* ============================================================
 * lists CRUD —— 用户的地点列表
 * ============================================================ */

/** 新增一个地点列表（标题默认"新列表"，可随后改名） */
export async function addPlaceList(
  tripId: string,
  title = "新列表"
): Promise<List> {
  const db = getDb();
  const [last] = await db
    .select({ position: lists.position })
    .from(lists)
    .where(eq(lists.tripId, tripId))
    .orderBy(desc(lists.position))
    .limit(1);
  const [row] = await db
    .insert(lists)
    .values({ tripId, title, position: last ? last.position + 1 : 0 })
    .returning();
  return row;
}

/** 列表改名 */
export async function renamePlaceList(
  listId: string,
  title: string
): Promise<List | null> {
  const db = getDb();
  const [row] = await db
    .update(lists)
    .set({ title })
    .where(eq(lists.id, listId))
    .returning();
  return row ?? null;
}

/**
 * 删除地点列表：连同其下全部实例（place_items 外键 cascade）。
 * 删空后若该 trip 一个列表都不剩，补建默认列表，保证始终有地方放地点。
 */
export async function deletePlaceList(listId: string): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ tripId: lists.tripId })
    .from(lists)
    .where(eq(lists.id, listId))
    .limit(1);
  if (!existing) return;
  await db.delete(lists).where(eq(lists.id, listId));

  const remaining = await db
    .select({ id: lists.id })
    .from(lists)
    .where(eq(lists.tripId, existing.tripId))
    .limit(1);
  if (remaining.length === 0) {
    await db.insert(lists).values({
      tripId: existing.tripId,
      title: "Places to visit",
      position: 0,
    });
  }
}

/* ============================================================
 * Undo / Redo：整体快照同步（只同步这一张表自己的东西）
 * ============================================================ */

export interface PlacesSnapshot {
  items: PlaceItem[];
  lists: List[];
}

/**
 * 把 trip 的 place_items + lists 整体替换成快照里的状态。
 *
 * ⚠️ items 和 lists 必须留在这**同一个** action 里，且先 lists 后 items：
 * place_items.list_id 有外键指回 lists、而且是 ON DELETE CASCADE，删 list 会连带
 * 删掉它下面的 item，插 item 又要求 list 已经存在。把这两张表拆成两个并行 action
 * （看着很自然的一刀）会直接撞外键。费用**不**在这里，它有 expenses.ts 里的
 * syncExpensesSnapshot —— 每个 action 只管自己的表，别再顺手写别人的表。
 */
export async function syncPlacesSnapshot(
  tripId: string,
  snapshot: PlacesSnapshot,
): Promise<void> {
  const db = getDb();

  // ---- lists ----
  // 逐行而不是合并成一条语句：lists 上有 (trip_id, position) 唯一索引
  // （lists_trip_position_unique），多行一条语句时中间态会撞它。行数很少，代价可忽略。
  // 从大到小插：快照是"追加在最后"的场景下，先占住大的位置才不会撞上还在那儿的旧行。
  const snapListIds = snapshot.lists.map((l) => l.id);
  const existingLists = await db
    .select({ id: lists.id })
    .from(lists)
    .where(eq(lists.tripId, tripId));
  const toDeleteLists = existingLists
    .filter((l) => !snapListIds.includes(l.id))
    .map((l) => l.id);
  if (toDeleteLists.length > 0) {
    await db.delete(lists).where(inArray(lists.id, toDeleteLists));
  }
  const sortedLists = [...snapshot.lists].sort((a, b) => b.position - a.position);
  for (const l of sortedLists) {
    await db
      .insert(lists)
      .values({ id: l.id, tripId, title: l.title, position: l.position })
      .onConflictDoUpdate({
        target: lists.id,
        set: { title: l.title, position: l.position },
      });
  }

  // ---- place_items ----
  // 先删掉快照里没有的（顺序不能和下面的插入对调）
  const snapItemIds = snapshot.items.map((it) => it.id);
  const existingItems = await db
    .select({ id: placeItems.id })
    .from(placeItems)
    .where(eq(placeItems.tripId, tripId));
  const toDeleteItems = existingItems
    .filter((it) => !snapItemIds.includes(it.id))
    .map((it) => it.id);
  if (toDeleteItems.length > 0) {
    await db.delete(placeItems).where(inArray(placeItems.id, toDeleteItems));
  }
  // 整批一条语句：Drizzle 把数组展开成多行 VALUES，冲突时用 excluded（= 本次想插的值）
  // 覆盖旧行。之前是逐行 insert + 逐行往返，20 个地点的撤销就是 20 趟（到 Neon 一趟
  // 一两秒，很可观）。createdAt 有意不写：新插的走默认值，已存在的保持原来那一刻。
  if (snapshot.items.length > 0) {
    await db
      .insert(placeItems)
      .values(
        snapshot.items.map((it) => ({
          id: it.id,
          tripId,
          groupKey: it.groupKey,
          sourceKind: it.sourceKind,
          sourceId: it.sourceId,
          name: it.name,
          address: it.address,
          tel: it.tel,
          type: it.type,
          photo: it.photo,
          lng: it.lng,
          lat: it.lat,
          listId: it.listId,
          dayDate: it.dayDate,
          position: it.position,
          note: it.note,
          description: it.description,
          timeFrom: it.timeFrom,
          timeTo: it.timeTo,
          url: it.url,
          visited: it.visited,
          routeModeToNext: it.routeModeToNext,
        })),
      )
      .onConflictDoUpdate({
        target: placeItems.id,
        set: {
          groupKey: sql`excluded.group_key`,
          sourceKind: sql`excluded.source_kind`,
          sourceId: sql`excluded.source_id`,
          name: sql`excluded.name`,
          address: sql`excluded.address`,
          tel: sql`excluded.tel`,
          type: sql`excluded.type`,
          photo: sql`excluded.photo`,
          lng: sql`excluded.lng`,
          lat: sql`excluded.lat`,
          listId: sql`excluded.list_id`,
          dayDate: sql`excluded.day_date`,
          position: sql`excluded.position`,
          note: sql`excluded.note`,
          description: sql`excluded.description`,
          timeFrom: sql`excluded.time_from`,
          timeTo: sql`excluded.time_to`,
          url: sql`excluded.url`,
          visited: sql`excluded.visited`,
          routeModeToNext: sql`excluded.route_mode_to_next`,
        },
      });
  }
}