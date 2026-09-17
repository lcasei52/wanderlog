"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
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
import type { Day } from "@/db/schema";
import { useExpenses } from "@/context/expenses-context";
import { useHistory, useRegisterSnapshot } from "@/context/history-context";
import { updateDayTitle as updateDayTitleAction } from "@/actions/days";
import { saveContainerColors } from "@/actions/trips";
import {
  addPlaceItem,
  addPlaceList as addPlaceListAction,
  copyPlaceItem,
  deletePlaceItem as deletePlaceItemAction,
  deletePlaceList as deletePlaceListAction,
  renamePlaceList as renamePlaceListAction,
  reorderLists as reorderListsAction,
  reorderPlaceItems as reorderPlaceItemsAction,
  updatePlaceItem as updatePlaceItemAction,
} from "@/actions/places";

/** 行程里的第 N 天（容器身份是 dayDate 字符串，这里附上展示信息） */
export interface DayInfo {
  dayNumber: DayNumber;
  dayDate: string; // "yyyy-MM-dd"，day 容器的键
  date: Date;
  label: string; // "M月d日"
  /*
   * "周四"。跟 label 一样在这儿算好，不在组件里各自 format：侧栏「行程」和正文
   * DayCard 的标题都是「周几 · 月日」，两处各写一遍迟早会分叉（一边 EEE 一边 EEEE
   * 就差一个字，而且没人会同时看着两边）。
   */
  weekday: string;
  /**
   * 这一天的副标题（days.title）：DayCard 里日期下面那行灰字，如"环球影城日"。
   * 没写过是 null（界面上显示灰色占位"添加副标题"）。
   *
   * 跟上面几个字段的来路不同：那些是按日期现算的，这个是**库里存着的**。
   */
  title: string | null;
}

interface PlacesSeeds {
  items: PlaceItem[];
  placeLists: PlaceListRow[];
  /**
   * 该行程的 days 行 —— 只有 days.title（每天那个副标题）有用。
   *
   * 注意"第几天/周几/几月几日"**不是**从这儿来的：那些是按行程起止日期现算的
   * （见 buildDays），所以这几十行数据可以缺（改过期的行程就会缺），缺的那天
   * 只是没有副标题。
   */
  dayRows: Day[];
  /**
   * 各地点列表 / 各天的主色（trips.container_colors），键 = 图层键
   * `l:<listId>` / `d:<dayDate>`（见 types/place 那两个 helper），值 = hex。
   *
   * **表里没有这个键 = 用 getColorByListId 哈希出来的默认色**，跟 hiddenLayers
   * "没记在里面就是可见"同一个方向：新建的列表、新加的一天天然不用回来补行。
   */
  containerColors: Record<string, string>;
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
  /** 某个地点列表的主色（没换过 = 哈希出的默认色） */
  listColor: (listId: string) => string;
  /** 某一天的主色（没换过 = 哈希出的默认色） */
  dayColor: (dayDate: string) => string;
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
  /**
   * 整列重排地点列表：传入这一列渲染顺序的全部 id。
   * 「在两个列表之间插一个新列表」= addPlaceList 之后拿新 id 走一次它。
   */
  reorderPlaceLists: (orderedIds: string[]) => Promise<void>;
  renamePlaceList: (listId: string, title: string) => Promise<void>;
  deletePlaceList: (listId: string) => Promise<void>;
  selectItem: (id: string) => void;
  clearSelection: () => void;
  setDateRange: (range: DateRange | undefined) => void;
  /** 写某一天的副标题；空串 = 抹掉 */
  setDayTitle: (dayDate: string, title: string) => Promise<void>;
  /** 换某个容器（列表/某天）的主色；color 传 null = 删掉记录、回到默认色 */
  setContainerColor: (container: PlaceContainer, color: string | null) => void;
}

const PlacesContext = createContext<PlacesContextValue | null>(null);

/** 计算 dayDate / dayDate 列表展示信息 */
function buildDays(
  dateRange: DateRange | undefined,
  dayTitles: Record<string, string>,
): DayInfo[] {
  const from = dateRange?.from;
  const to = dateRange?.to;
  if (!from || !to) return [];
  const count = differenceInDays(to, from) + 1;
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(from, i);
    const dayDate = format(date, "yyyy-MM-dd");
    return {
      dayNumber: i + 1,
      dayDate,
      date,
      label: format(date, "M月d日", { locale: zhCN }),
      weekday: format(date, "EEE", { locale: zhCN }),
      title: dayTitles[dayDate] ?? null,
    };
  });
}

/**
 * days 行 → 按 dayDate 索引的副标题表。
 * 只收真写了副标题的那几天：没写的那些不占键，"有没有副标题"就是"表里有没有这个键"。
 */
function buildDayTitles(rows: Day[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (row.title) map[row.date] = row.title;
  }
  return map;
}

/** 排序：position 升序，同 position 按创建先后 */
function byPosition(a: PlaceItem, b: PlaceItem): number {
  if (a.position !== b.position) return a.position - b.position;
  return +new Date(a.createdAt) - +new Date(b.createdAt);
}

function keyOf(item: Pick<PlaceItem, "listId" | "dayDate">): string {
  return containerKey(containerOf(item));
}

function containerOf(item: Pick<PlaceItem, "listId" | "dayDate">): PlaceContainer {
  return item.listId
    ? { kind: "list", listId: item.listId }
    : { kind: "day", dayDate: item.dayDate! };
}

/**
 * 容器 → 图层键。keyOf 也走它，**别再各写一份**：
 * "容器身份"和"颜色记在哪个键下"必须是同一个字符串，分叉了就是换色换不动。
 */
function containerKey(container: PlaceContainer): string {
  return container.kind === "list"
    ? listLayerKey(container.listId)
    : dayLayerKey(container.dayDate);
}

/*
 * 没换过色时用的那个默认色。
 *
 * ⚠️ 这两句的哈希输入（列表给 listId、某天给 `day-${dayDate}` 这个模板串）
 * **一个字都不能改** —— 它们决定所有既有列表/天现在是什么颜色，改了就是整站集体变色。
 * 也**不要**顺手改成传图层键（带 `l:` / `d:` 前缀的那个串）：那是另一串哈希、另一批颜色。
 *
 * 某天那串之所以带 `day-` 前缀而不是直接用日期：日期只由数字和横杠组成，
 * 跟 uuid 不在同一个输入空间里，直接哈希出来的颜色分布会很难看。这是当初定的形状，改不得。
 *
 * 名字里的 List 是历史叫法（lib/colors 的 getColorByListId 本意就是"每个列表一个色"，
 * 后来某一天也复用了同一套），它跟"地点列表"不是一回事 —— 两个函数一个管列表、一个管某天。
 */
function defaultListColor(listId: string): string {
  return getColorByListId(listId);
}

function defaultDayColor(dayDate: string): string {
  return getColorByListId(`day-${dayDate}`);
}

/** 容器版的默认色。setContainerColor 用它判断"点了等于没点"，别名别处用不到 */
function defaultContainerColor(container: PlaceContainer): string {
  return container.kind === "list"
    ? defaultListColor(container.listId)
    : defaultDayColor(container.dayDate);
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
  const { push, restoreNonce } = useHistory();

  /*
   * 只给 setDayTitle 用的"最新值"（照 notes-context 的写法）：免得把它写进依赖数组，
   * 那会让这个回调每撤销一次就换一次身份。
   */
  const restoreNonceRef = useRef(restoreNonce);
  useLayoutEffect(() => {
    restoreNonceRef.current = restoreNonce;
  });

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

  /*
   * 每天的副标题（days.title），按 dayDate 索引。
   *
   * 它**跟着 places 这一片进快照**（见下面 useRegisterSnapshot）—— 写的是 days 表，
   * 但登记在同一片里，理由写在 history-context 的 TripSnapshot 上。所以它也归撤销栈管：
   * 连改两天的副标题、按一下撤销本该只退掉后一天，那靠的是 sameSnapshot 里为它补的
   * 那一行；写回库靠 syncAll 里的 syncDayTitlesSnapshot。漏掉哪一处都是静默失效。
   */
  const [dayTitles, setDayTitles] = useState<Record<string, string>>(() =>
    buildDayTitles(seeds.dayRows),
  );

  /*
   * 各地点列表 / 各天的主色（trips.container_colors），按图层键索引。
   *
   * 也**跟着 places 这一片进快照**（跟 dayTitles 一样：写的是另一张表，但登记在同一片里）。
   * 于是同样归撤销栈管，同样有三处"漏了就静默失效"的地方：history-context 的
   * sameSnapshot / syncAll 两行，以及下面 setContainerColor 里那句整份替换。
   *
   * ⚠️ 这里**任何时候都是整份替换**（{...prev} / 删键），绝不 prev[key] = color ——
   * 引用不变的话 sameSnapshot 会判定成没变、push() 直接提前返回，于是"连换两个颜色、
   * 按一下撤销两个一起退"。其他几个 state 也都是这个规矩，见 history-context 顶部。
   */
  const [containerColors, setContainerColors] = useState<Record<string, string>>(
    seeds.containerColors,
  );

  const days = useMemo(
    () => buildDays(dateRange, dayTitles),
    [dateRange, dayTitles],
  );

  /*
   * 撤销栈不在这里 —— 它已经抬到所有 provider 外面了（src/context/history-context.tsx）。
   * 本组件把自己这一片（items + placeLists + dayTitles + containerColors）登记进去，
   * 每个改了行程数据的动作在动手**之前**调一次 push()。
   *
   * ⚠️ 加新的 mutator、或者删掉某个 push() 之前，先读 history-context 顶部那段撤销
   * 契约：哪些进快照、哪些有意不进、以及"一次手势一份快照"的规矩都在那里。
   */
  useRegisterSnapshot(
    "places",
    () => ({ items, lists: placeLists, dayTitles, containerColors }),
    (slice) => {
      setItems(slice.items);
      setPlaceLists(slice.lists);
      setDayTitles(slice.dayTitles);
      setContainerColors(slice.containerColors);
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

  /*
   * 容器主色的**唯一出口**：用户换过的色记在 containerColors 里（按图层键），
   * 没记的就现算一个（defaultXxxColor）。外面（PlaceCard / MapView / 图层选择器 /
   * 详情卡）一律走这两个或走 itemColor，谁都别再自己调一次 getColorByListId ——
   * 那样换色只改得动一半的界面。
   */
  const listColor = useCallback(
    (listId: string) =>
      containerColors[listLayerKey(listId)] ?? defaultListColor(listId),
    [containerColors],
  );

  const dayColor = useCallback(
    (dayDate: string) =>
      containerColors[dayLayerKey(dayDate)] ?? defaultDayColor(dayDate),
    [containerColors],
  );

  const itemColor = useCallback(
    (target: PlaceItem) =>
      target.listId ? listColor(target.listId) : dayColor(target.dayDate!),
    [listColor, dayColor],
  );

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

  /**
   * 写某一天的副标题（DayCard 里那行灰字）。空串 = 抹掉那一行。
   *
   * **不是**乐观更新（跟列表改名一样，等服务器回来再改本地那份）—— 输入框里那份草稿
   * 由 DaySubtitle 自己攥着，它只在"源头这个值真的变了"时才重置，所以异步这一两秒里
   * 用户打的字不会被擦（规矩五，照 ListShell 的标题改名）。
   *
   * ★ 这里还有一处竞态，和 notes-context 的 saveContent 一模一样：点撤销按钮时输入框
   * 会先失焦，于是"失焦保存"和"撤销"挤在一起 —— 这一趟还没回来，撤销已经把本地换成
   * 了快照里那份。挡法就是开头记下的 restoreNonce：回来时若它变了，说明这期间恢复过，
   * 这次保存的效果已经被撤销接管（撤销排队的那次整表同步会把库也改成快照里的样子），
   * 这时**不要**再用服务端结果覆盖本地。见 history-context 顶部规矩四。
   */
  const setDayTitle = useCallback(
    async (dayDate: string, title: string) => {
      const next = title.trim();
      const nonceAtStart = restoreNonceRef.current;
      // push 必须在第一个 await 之前：它取的是"上一次已提交渲染"的那份副标题
      push();
      try {
        await updateDayTitleAction(tripId, dayDate, next || null);
        if (restoreNonceRef.current !== nonceAtStart) return;
        setDayTitles((prev) => {
          const copy = { ...prev };
          if (next) copy[dayDate] = next;
          else delete copy[dayDate];
          return copy;
        });
      } catch (err) {
        console.error("保存当日副标题失败:", err);
      }
    },
    [tripId, push],
  );

  /**
   * 换某个容器（地点列表 / 某一天）的主色。`color` 传 null = 删掉记录、回到默认哈希色。
   *
   * **乐观更新**，形状跟 reorderItems 一套：push → 先改本地 → 再发 action，
   * 失败只 console.error（不回滚，跟其他乐观动作一致）。
   *
   * 为什么这里必须乐观、而上面的 setDayTitle 必须等服务器：那个是**输入框**里的草稿，
   * 本地先改会跟用户正在打的字打架；这个只是点一下色块 —— 到 Neon 一趟一两秒，
   * 点完等两秒才变色，用起来就是坏的。
   *
   * 开头那句"值没变就直接 return"不是省事，是**撤销栈的账**：恢复到默认色时
   * 用户可能正点在一个本来就是默认色的色块上，push 了就会塞进一条内容完全相同的快照，
   * 于是撤销按钮按一下看不出任何变化，像坏了。
   *
   * ⚠️ 下一份必须是**整份替换**（见 containerColors 那段）；这里已经是了，别改成原地赋值。
   */
  const setContainerColor = useCallback(
    (container: PlaceContainer, color: string | null) => {
      const key = containerKey(container);
      const stored = containerColors[key] ?? null;
      if (color === null) {
        if (stored === null) return; // 本来就没换过，再点「恢复默认」= 什么也没发生
      } else if ((stored ?? defaultContainerColor(container)) === color) {
        // 点中的正是**现在就在用的**那个色。注意比的是"解析出来的色"而不是"表里存的值"：
        // 用户可能点的恰好就是他那个默认色，这时候存进去等于什么都没变，却白写一次库、
        // 还往撤销栈里塞一条看不出变化的记录。
        return;
      }

      push();
      const next = { ...containerColors };
      if (color) next[key] = color;
      else delete next[key];
      setContainerColors(next);

      saveContainerColors(tripId, next).catch((err) => {
        console.error("保存容器颜色失败:", err);
      });
    },
    [containerColors, tripId, push],
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

  /**
   * 整列重排地点列表：按传入顺序把 position 改成 0..n-1。
   *
   * 跟上面的 reorderItems 有两处**必须**不一样：
   *
   * 1. 这里连**数组本身**也要摆成新顺序。items 是按 position 现排的
   *    （containerGroups 里那句 byPosition），所以那边只改 position 就够了；
   *    placeLists 没有这么一层 —— 概览就是照数组顺序渲染的 —— 只改 position 会
   *    变成"库里换了、屏幕上没换"。sort 稳定，不在 orderedIds 里的行（正常没有）
   *    保持相对顺序，不会掉。
   * 2. 库里那条 (trip_id, position) 唯一索引要求分两步写，理由写在
   *    actions/places.ts 的 reorderLists 上。
   */
  const reorderPlaceLists = useCallback(
    async (orderedIds: string[]) => {
      push();
      const order = new Map(orderedIds.map((id, i) => [id, i]));
      setPlaceLists((prev) =>
        prev
          .map((l) =>
            order.has(l.id) ? { ...l, position: order.get(l.id)! } : l,
          )
          .sort((a, b) => a.position - b.position),
      );
      try {
        await reorderListsAction(tripId, orderedIds);
      } catch (err) {
        console.error("列表排序失败:", err);
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
      /*
       * containerColors 里那条 l:<listId> **有意留着不删**：这个列表已经不在页面上了，
       * 那条记录看不见也无害。顺手删的话，这次删除就得把颜色那一列也一起写一遍
       * （多一份"这份颜色是哪次快照的"的账），而 id 是 uuid、永不复用，
       * 留着不会让将来某个新列表撞上旧色。
       */
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
      listColor,
      dayColor,
      containerOf,
      containerTitle,
      addItem,
      copyItemTo,
      deleteItem,
      removeItemsBySource,
      updateItem,
      reorderItems,
      addPlaceList,
      reorderPlaceLists,
      renamePlaceList,
      deletePlaceList,
      selectItem,
      clearSelection,
      setDateRange,
      setDayTitle,
      setContainerColor,
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
      listColor,
      dayColor,
      containerOf,
      containerTitle,
      addItem,
      copyItemTo,
      deleteItem,
      removeItemsBySource,
      updateItem,
      reorderItems,
      addPlaceList,
      reorderPlaceLists,
      renamePlaceList,
      deletePlaceList,
      selectItem,
      clearSelection,
      setDateRange,
      setDayTitle,
      setContainerColor,
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
