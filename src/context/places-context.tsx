"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { addDays, differenceInDays, format, parse } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  dayLayerKey,
  listLayerKey,
  type DayNumber,
  type PlaceContainer,
  type PlaceItem,
  type PlaceItemInput,
  type PlaceItemPatch,
  type PlaceListRow,
} from "@/types/place";
import { getColorByListId } from "@/lib/colors";
import {
  addPlaceItem,
  addPlaceList as addPlaceListAction,
  copyPlaceItem,
  deletePlaceItem as deletePlaceItemAction,
  deletePlaceList as deletePlaceListAction,
  renamePlaceList as renamePlaceListAction,
  reorderPlaceItems as reorderPlaceItemsAction,
  syncPlacesSnapshot,
  updatePlaceItem as updatePlaceItemAction,
} from "@/actions/places";

/** 行程里的第 N 天（容器身份是 dayDate 字符串，这里附上展示信息） */
export interface DayInfo {
  dayNumber: DayNumber;
  dayDate: string; // "yyyy-MM-dd"，day 容器的键
  date: Date;
  label: string; // "M月d日"
}

interface PlacesSeeds {
  items: PlaceItem[];
  placeLists: PlaceListRow[];
}

export interface PlacesContextValue {
  // 数据
  tripId: string;
  tripStartDate: string | null;
  items: PlaceItem[];
  placeLists: PlaceListRow[];
  days: DayInfo[];
  dateRange: DateRange | undefined;
  selectedItemId: string | null;
  focusNonce: number; // selectItem 自增，MapView 据此做聚焦平移

  // 派生查询
  listItems: (listId: string) => PlaceItem[]; // 按 position 排序
  dayItemsByDate: (dayDate: string) => PlaceItem[];
  itemsInContainer: (container: PlaceContainer) => PlaceItem[];
  item: (id: string) => PlaceItem | undefined;
  /** 同一 POI（同 group_key）的全部实例，含自己；place null 时返回空 */
  peers: (item: PlaceItem) => PlaceItem[];
  /** 容器里渲染的序号 1..N（与该实例在地图上的 marker 编号一致） */
  itemNumber: (item: PlaceItem) => number;
  /** 容器主色（visited 变灰由展示层处理） */
  itemColor: (item: PlaceItem) => string;
  /** 该实例所属容器 */
  containerOf: (item: PlaceItem) => PlaceContainer;
  /** 容器展示标题（列表标题 / "Day N · M月d日"） */
  containerTitle: (container: PlaceContainer) => string;

  // 动作（都先走 server action 成功后再更新本地态）
  /** 新增一份实例到容器；默认 select+聚焦（可传 { select:false } 关闭）；atStart = 插到容器开头 */
  addItem: (
    input: PlaceItemInput,
    container: PlaceContainer,
    opts?: { select?: boolean; atStart?: boolean },
  ) => Promise<PlaceItem | null>;
  /** 复制到另一容器（不改变选中） */
  copyItemTo: (
    itemId: string,
    container: PlaceContainer,
  ) => Promise<PlaceItem | null>;
  deleteItem: (id: string) => Promise<void>;
  /** 删掉某航班/酒店 id 的全部绑定实例（服务端已删，这里同步本地态） */
  removeItemsBySource: (sourceKind: string, sourceId: string) => void;
  updateItem: (id: string, patch: PlaceItemPatch) => Promise<void>;
  /**
   * 容器内拖拽排序：传入该容器渲染顺序的全部 id。
   * 本地先把 position 改成下标（byPosition 会据此重排），再落库。
   */
  reorderItems: (orderedIds: string[]) => Promise<void>;
  addPlaceList: (title?: string) => Promise<PlaceListRow | null>;
  renamePlaceList: (listId: string, title: string) => Promise<void>;
  deletePlaceList: (listId: string) => Promise<void>;
  selectItem: (id: string) => void;
  clearSelection: () => void;
  setDateRange: (range: DateRange | undefined) => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const PlacesContext = createContext<PlacesContextValue | null>(null);

/** 计算 dayDate / dayDate 列表展示信息 */
function buildDays(dateRange: DateRange | undefined): DayInfo[] {
  const from = dateRange?.from;
  const to = dateRange?.to;
  if (!from || !to) return [];
  const count = differenceInDays(to, from) + 1;
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(from, i);
    return {
      dayNumber: i + 1,
      dayDate: format(date, "yyyy-MM-dd"),
      date,
      label: format(date, "M月d日", { locale: zhCN }),
    };
  });
}

/** 排序：position 升序，同 position 按创建先后 */
function byPosition(a: PlaceItem, b: PlaceItem): number {
  if (a.position !== b.position) return a.position - b.position;
  return +new Date(a.createdAt) - +new Date(b.createdAt);
}

function keyOf(item: Pick<PlaceItem, "listId" | "dayDate">): string {
  return item.listId
    ? listLayerKey(item.listId)
    : dayLayerKey(item.dayDate!);
}

function containerOf(item: Pick<PlaceItem, "listId" | "dayDate">): PlaceContainer {
  return item.listId
    ? { kind: "list", listId: item.listId }
    : { kind: "day", dayDate: item.dayDate! };
}

export function PlacesProvider({
  tripId,
  tripDates,
  seeds,
  children,
}: {
  tripId: string;
  tripDates: { startDate?: string | null; endDate?: string | null };
  seeds: PlacesSeeds;
  children: ReactNode;
}) {
  const [items, setItems] = useState<PlaceItem[]>(seeds.items);
  const [placeLists, setPlaceLists] = useState<PlaceListRow[]>(seeds.placeLists);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [dateRange, setDateRangeState] = useState<DateRange | undefined>(() => {
    const from = tripDates.startDate
      ? parse(tripDates.startDate, "yyyy-MM-dd", new Date())
      : undefined;
    const to = tripDates.endDate
      ? parse(tripDates.endDate, "yyyy-MM-dd", new Date())
      : undefined;
    return from && to ? { from, to } : undefined;
  });

  const days = useMemo(() => buildDays(dateRange), [dateRange]);

  // ---- Undo / Redo 历史栈 ----
  const MAX_HISTORY = 50;
  type Snapshot = { items: PlaceItem[]; placeLists: PlaceListRow[] };
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const pushSnapshot = useCallback(() => {
    pastRef.current = [
      ...pastRef.current.slice(-(MAX_HISTORY - 1)),
      { items, placeLists },
    ];
    futureRef.current = [];
    setHistoryVersion((v) => v + 1);
  }, [items, placeLists]);

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;
    const snap = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    futureRef.current = [...futureRef.current, { items, placeLists }];
    setItems(snap.items);
    setPlaceLists(snap.placeLists);
    setHistoryVersion((v) => v + 1);
    syncPlacesSnapshot(tripId, { items: snap.items, lists: snap.placeLists }).catch(
      (err) => console.error("undo 同步失败:", err),
    );
  }, [items, placeLists, tripId]);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    const snap = future[future.length - 1];
    futureRef.current = future.slice(0, -1);
    pastRef.current = [...pastRef.current, { items, placeLists }];
    setItems(snap.items);
    setPlaceLists(snap.placeLists);
    setHistoryVersion((v) => v + 1);
    syncPlacesSnapshot(tripId, { items: snap.items, lists: snap.placeLists }).catch(
      (err) => console.error("redo 同步失败:", err),
    );
  }, [items, placeLists, tripId]);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  /** 按容器分组的排序结果（map 缓存，list/day 都走 keyOf） */
  const containerGroups = useMemo(() => {
    const map = new Map<string, PlaceItem[]>();
    for (const item of items) {
      const key = keyOf(item);
      const arr = map.get(key);
      if (arr) arr.push(item);
      else map.set(key, [item]);
    }
    for (const arr of map.values()) arr.sort(byPosition);
    return map;
  }, [items]);

  const listItems = useCallback(
    (listId: string) => containerGroups.get(`l:${listId}`) ?? [],
    [containerGroups],
  );
  const dayItemsByDate = useCallback(
    (dayDate: string) => containerGroups.get(`d:${dayDate}`) ?? [],
    [containerGroups],
  );
  const itemsInContainer = useCallback(
    (container: PlaceContainer) =>
      containerGroups.get(
        container.kind === "list" ? `l:${container.listId}` : `d:${container.dayDate}`,
      ) ?? [],
    [containerGroups],
  );

  const item = useCallback(
    (id: string) => items.find((it) => it.id === id),
    [items],
  );

  const itemNumber = useCallback(
    (target: PlaceItem) => {
      const arr = containerGroups.get(keyOf(target));
      if (!arr) return 1;
      const idx = arr.findIndex((it) => it.id === target.id);
      return idx < 0 ? 1 : idx + 1;
    },
    [containerGroups],
  );

  const itemColor = useCallback((target: PlaceItem) => {
    return target.listId
      ? getColorByListId(target.listId)
      : getColorByListId(`day-${target.dayDate}`);
  }, []);

  const peers = useCallback(
    (target: PlaceItem) => {
      if (!target.groupKey) return [target];
      return items.filter((it) => it.groupKey === target.groupKey);
    },
    [items],
  );

  const containerTitle = useCallback(
    (container: PlaceContainer) => {
      if (container.kind === "list") {
        return (
          placeLists.find((l) => l.id === container.listId)?.title ?? "列表"
        );
      }
      const day = days.find((d) => d.dayDate === container.dayDate);
      return day ? `Day ${day.dayNumber} · ${day.label}` : container.dayDate;
    },
    [placeLists, days],
  );

  const selectItem = useCallback((id: string) => {
    setSelectedItemId(id);
    setFocusNonce((n) => n + 1);
  }, []);

  const clearSelection = useCallback(() => setSelectedItemId(null), []);

  const setDateRange = useCallback(
    (range: DateRange | undefined) => setDateRangeState(range),
    [],
  );

  // ---- 动作 ----
  const addItem = useCallback(
    async (
      input: PlaceItemInput,
      container: PlaceContainer,
      opts?: { select?: boolean; atStart?: boolean },
    ) => {
      pushSnapshot();
      try {
        const row = await addPlaceItem(tripId, container, input, {
          atStart: opts?.atStart,
        });
        if (!row) return null;
        setItems((prev) => [...prev, row]);
        if (opts?.select !== false) {
          selectItem(row.id);
        }
        return row;
      } catch (err) {
        console.error("添加地点失败:", err);
        return null;
      }
    },
    [tripId, selectItem, pushSnapshot],
  );

  const copyItemTo = useCallback(
    async (itemId: string, container: PlaceContainer) => {
      pushSnapshot();
      try {
        const row = await copyPlaceItem(itemId, container);
        if (row) setItems((prev) => [...prev, row]);
        return row;
      } catch (err) {
        console.error("复制地点失败:", err);
        return null;
      }
    },
    [pushSnapshot],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      pushSnapshot();
      try {
        await deletePlaceItemAction(id);
        setItems((prev) => prev.filter((it) => it.id !== id));
        setSelectedItemId((cur) => (cur === id ? null : cur));
      } catch (err) {
        console.error("删除地点失败:", err);
      }
    },
    [pushSnapshot],
  );

  const removeItemsBySource = useCallback(
    (sourceKind: string, sourceId: string) => {
      // 若当前选中的正是被删的那一份，先清空选择（避免在 updater 里做副作用）
      const sel = selectedItemId ? item(selectedItemId) : null;
      if (sel && sel.sourceKind === sourceKind && sel.sourceId === sourceId) {
        setSelectedItemId(null);
      }
      setItems((prev) =>
        prev.filter(
          (it) => !(it.sourceKind === sourceKind && it.sourceId === sourceId)
        )
      );
    },
    [selectedItemId, item],
  );

  const updateItem = useCallback(
    async (id: string, patch: PlaceItemPatch) => {
      pushSnapshot();
      try {
        const row = await updatePlaceItemAction(id, patch);
        if (row) {
          setItems((prev) => prev.map((it) => (it.id === id ? row : it)));
        }
      } catch (err) {
        console.error("更新地点失败:", err);
      }
    },
    [pushSnapshot],
  );

  const reorderItems = useCallback(
    async (orderedIds: string[]) => {
      pushSnapshot();
      const order = new Map(orderedIds.map((id, i) => [id, i]));
      setItems((prev) =>
        prev.map((it) =>
          order.has(it.id) ? { ...it, position: order.get(it.id)! } : it,
        ),
      );
      try {
        await reorderPlaceItemsAction(tripId, orderedIds);
      } catch (err) {
        console.error("地点排序失败:", err);
      }
    },
    [tripId, pushSnapshot],
  );

  const addPlaceList = useCallback(
    async (title?: string) => {
      pushSnapshot();
      try {
        const row = await addPlaceListAction(tripId, title);
        if (row) setPlaceLists((prev) => [...prev, row]);
        return row;
      } catch (err) {
        console.error("新建列表失败:", err);
        return null;
      }
    },
    [tripId, pushSnapshot],
  );

  const renamePlaceList = useCallback(async (listId: string, title: string) => {
    pushSnapshot();
    try {
      const row = await renamePlaceListAction(listId, title);
      if (row) {
        setPlaceLists((prev) => prev.map((l) => (l.id === row.id ? row : l)));
      }
    } catch (err) {
      console.error("重命名列表失败:", err);
    }
  }, [pushSnapshot]);

  const deletePlaceList = useCallback(async (listId: string) => {
    pushSnapshot();
    try {
      await deletePlaceListAction(listId);
      setPlaceLists((prev) => prev.filter((l) => l.id !== listId));
      setItems((prev) => prev.filter((it) => it.listId !== listId));
    } catch (err) {
      console.error("删除列表失败:", err);
    }
  }, [pushSnapshot]);

  const value = useMemo<PlacesContextValue>(
    () => ({
      tripId,
      tripStartDate: tripDates.startDate ?? null,
      items,
      placeLists,
      days,
      dateRange,
      selectedItemId,
      focusNonce,
      listItems,
      dayItemsByDate,
      itemsInContainer,
      item,
      peers,
      itemNumber,
      itemColor,
      containerOf,
      containerTitle,
      addItem,
      copyItemTo,
      deleteItem,
      removeItemsBySource,
      updateItem,
      reorderItems,
      addPlaceList,
      renamePlaceList,
      deletePlaceList,
      selectItem,
      clearSelection,
      setDateRange,
      undo,
      redo,
      canUndo,
      canRedo,
    }),
    [
      tripId,
      tripDates.startDate,
      items,
      placeLists,
      days,
      dateRange,
      selectedItemId,
      focusNonce,
      listItems,
      dayItemsByDate,
      itemsInContainer,
      item,
      peers,
      itemNumber,
      itemColor,
      containerOf,
      containerTitle,
      addItem,
      copyItemTo,
      deleteItem,
      removeItemsBySource,
      updateItem,
      reorderItems,
      addPlaceList,
      renamePlaceList,
      deletePlaceList,
      selectItem,
      clearSelection,
      setDateRange,
      undo,
      redo,
      canUndo,
      canRedo,
      historyVersion,
    ],
  );

  return <PlacesContext.Provider value={value}>{children}</PlacesContext.Provider>;
}

export function usePlaces(): PlacesContextValue {
  const ctx = useContext(PlacesContext);
  if (!ctx) {
    throw new Error("usePlaces 必须在 <PlacesProvider> 内使用");
  }
  return ctx;
}
