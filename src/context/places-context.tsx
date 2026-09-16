"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
import { useExpenses } from "@/context/expenses-context";
import { useHistory, useRegisterSnapshot } from "@/context/history-context";
import {
  addPlaceItem,
  addPlaceList as addPlaceListAction,
  copyPlaceItem,
  deletePlaceItem as deletePlaceItemAction,
  deletePlaceList as deletePlaceListAction,
  renamePlaceList as renamePlaceListAction,
  reorderPlaceItems as reorderPlaceItemsAction,
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
  /*
   * 删地点时要顺手把挂在它上面的费用从本地费用表里摘掉（服务端已经一起删了）。
   * 合法是因为 ExpensesProvider 在 TripWorkspace 里是 PlacesProvider 的**外层**，
   * 别把这两层的顺序调过来。
   *
   * 撤销栈现在在所有 provider 外面（见 history-context），这里够不到它，也不该够到 ——
   * 本组件只管把"自己这一片"登记进去、动手前 push 一次。
   */
  const { removeExpensesByLinkedItem } = useExpenses();
  const { push } = useHistory();

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

  /*
   * 撤销栈不在这里 —— 它已经抬到所有 provider 外面了（src/context/history-context.tsx）。
   * 本组件把自己这一片（items + placeLists）登记进去，每个改了行程数据的动作在动手
   * **之前**调一次 push()。
   *
   * ⚠️ 加新的 mutator、或者删掉某个 push() 之前，先读 history-context 顶部那段撤销
   * 契约：哪些进快照、哪些有意不进、以及"一次手势一份快照"的规矩都在那里。
   */
  useRegisterSnapshot(
    "places",
    () => ({ items, lists: placeLists }),
    (slice) => {
      setItems(slice.items);
      setPlaceLists(slice.lists);
    }
  );

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
      // push 必须在第一个 await 之前：它取的是"上一次已提交渲染"的状态
      push();
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
    [tripId, selectItem, push],
  );

  const copyItemTo = useCallback(
    async (itemId: string, container: PlaceContainer) => {
      push();
      try {
        const row = await copyPlaceItem(itemId, container);
        if (row) setItems((prev) => [...prev, row]);
        return row;
      } catch (err) {
        console.error("复制地点失败:", err);
        return null;
      }
    },
    [push],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      push();
      try {
        await deletePlaceItemAction(id);
        setItems((prev) => prev.filter((it) => it.id !== id));
        setSelectedItemId((cur) => (cur === id ? null : cur));
        // 挂在这一份上的费用服务端已一起删（见 actions/places.ts），本地跟着清
        removeExpensesByLinkedItem("place", id);
      } catch (err) {
        console.error("删除地点失败:", err);
      }
    },
    [push, removeExpensesByLinkedItem],
  );

  const removeItemsBySource = useCallback(
    (sourceKind: string, sourceId: string) => {
      // 先按当前 items 找出要删的那几份：它们上面记过的费用也要清
      // （不在 setItems 的 updater 里做，那个函数必须是纯的）
      const doomed = items.filter(
        (it) => it.sourceKind === sourceKind && it.sourceId === sourceId,
      );
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
      for (const d of doomed) removeExpensesByLinkedItem("place", d.id);
    },
    [items, selectedItemId, item, removeExpensesByLinkedItem],
  );

  const updateItem = useCallback(
    async (id: string, patch: PlaceItemPatch) => {
      push();
      try {
        const row = await updatePlaceItemAction(id, patch);
        if (row) {
          setItems((prev) => prev.map((it) => (it.id === id ? row : it)));
        }
      } catch (err) {
        console.error("更新地点失败:", err);
      }
    },
    [push],
  );

  const reorderItems = useCallback(
    async (orderedIds: string[]) => {
      push();
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
    [tripId, push],
  );

  const addPlaceList = useCallback(
    async (title?: string) => {
      push();
      try {
        const row = await addPlaceListAction(tripId, title);
        if (row) setPlaceLists((prev) => [...prev, row]);
        return row;
      } catch (err) {
        console.error("新建列表失败:", err);
        return null;
      }
    },
    [tripId, push],
  );

  const renamePlaceList = useCallback(async (listId: string, title: string) => {
    push();
    try {
      const row = await renamePlaceListAction(listId, title);
      if (row) {
        setPlaceLists((prev) => prev.map((l) => (l.id === row.id ? row : l)));
      }
    } catch (err) {
      console.error("重命名列表失败:", err);
    }
  }, [push]);

  const deletePlaceList = useCallback(async (listId: string) => {
    push();
    try {
      await deletePlaceListAction(listId);
      setPlaceLists((prev) => prev.filter((l) => l.id !== listId));
      setItems((prev) => prev.filter((it) => it.listId !== listId));
    } catch (err) {
      console.error("删除列表失败:", err);
    }
  }, [push]);

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
