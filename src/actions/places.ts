"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import {
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
      timeFrom: stringOrNull(input.timeFrom),
      timeTo: stringOrNull(input.timeTo),
      url: stringOrNull(input.url),
      visited: input.visited ?? false,
    })
    .returning();
  revalidatePath(`/plan/${tripId}`);
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
  if (row) revalidatePath(`/plan/${row.tripId}`);
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
  revalidatePath(`/plan/${tripId}`);
}

/** 删除一份实例（只删这一份，其它容器里的副本不受影响） */
export async function deletePlaceItem(id: string): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ tripId: placeItems.tripId })
    .from(placeItems)
    .where(eq(placeItems.id, id))
    .limit(1);
  if (!existing) return;
  await db.delete(placeItems).where(eq(placeItems.id, id));
  revalidatePath(`/plan/${existing.tripId}`);
}

/** 删除某父记录（航班/酒店）自动生成的绑定实例（source_kind + source_id） */
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
    .returning({ tripId: placeItems.tripId });
  for (const r of removed) revalidatePath(`/plan/${r.tripId}`);
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
      timeFrom: source.timeFrom,
      timeTo: source.timeTo,
      url: source.url,
      visited: source.visited,
      // routeModeToNext 故意不复制：那是"它和**下一个**地点之间"的属性，
      // 副本落在别的容器里，下一个地点多半是别人，抄过去反而是错的
    })
    .returning();
  revalidatePath(`/plan/${source.tripId}`);
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
  revalidatePath(`/plan/${tripId}`);
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
  revalidatePath(`/plan/${tripId}`);
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
  if (row) revalidatePath(`/plan/${row.tripId}`);
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
  revalidatePath(`/plan/${existing.tripId}`);
}

/* ============================================================
 * Undo / Redo：整体快照同步
 * ============================================================ */

export interface PlacesSnapshot {
  items: PlaceItem[];
  lists: List[];
}

/**
 * 把 trip 的 items + lists 整体替换为快照里的状态。
 */
export async function syncPlacesSnapshot(
  tripId: string,
  snapshot: PlacesSnapshot,
): Promise<void> {
  const db = getDb();

  // ---- lists ----
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
  for (const it of snapshot.items) {
    await db
      .insert(placeItems)
      .values({
        id: it.id, tripId,
        groupKey: it.groupKey, sourceKind: it.sourceKind, sourceId: it.sourceId,
        name: it.name, address: it.address, tel: it.tel, type: it.type,
        photo: it.photo, lng: it.lng, lat: it.lat,
        listId: it.listId, dayDate: it.dayDate, position: it.position,
        note: it.note, timeFrom: it.timeFrom, timeTo: it.timeTo,
        url: it.url, visited: it.visited, routeModeToNext: it.routeModeToNext,
      })
      .onConflictDoUpdate({
        target: placeItems.id,
        set: {
          groupKey: it.groupKey, sourceKind: it.sourceKind, sourceId: it.sourceId,
          name: it.name, address: it.address, tel: it.tel, type: it.type,
          photo: it.photo, lng: it.lng, lat: it.lat,
          listId: it.listId, dayDate: it.dayDate, position: it.position,
          note: it.note, timeFrom: it.timeFrom, timeTo: it.timeTo,
          url: it.url, visited: it.visited, routeModeToNext: it.routeModeToNext,
        },
      });
  }

  revalidatePath(`/plan/${tripId}`);
}