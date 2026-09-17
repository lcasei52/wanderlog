"use client";

import { useMemo, useState } from "react";
import { Ellipsis } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { usePlaces } from "@/context/places-context";
import { useBookings } from "@/context/bookings-context";
import type { PlaceContainer, PlaceItem } from "@/types/place";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/types/expense";
import CategoryIcon from "@/components/CategoryIcon";
import {
  formatExpenseDate,
  inferFromFlight,
  inferFromHotel,
  inferFromPlace,
  inferFromTrain,
  type PickableItem,
} from "@/lib/expense-helpers";
import AllItemsDialog from "./AllItemsDialog";
import PickableItemRow from "./PickableItemRow";

/** 「从您的行程中选择」里先露几个，剩下的走「查看全部」 */
const PREVIEW_COUNT = 4;

interface ItemPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedKey?: string | null;
  onSelectItem: (item: PickableItem) => void;
  onSelectCategory: (category: ExpenseCategory) => void;
}

/**
 * 「选择项目」：上半屏是行程里已有的项目（地点/航班/住宿/火车），下半屏是类别快捷入口。
 * 中间用一条分隔线隔开。
 *
 * 视觉参照 Wanderlog：分区标题是黑色粗体（不是小号大写灰字），项目行没有边框、
 * 就是「浅灰圆底图标 + 名字 + 来自哪里」，类别是「浅灰圆角块 + 图标 + 名字」。
 *
 * **不去重、按行程顺序排**：同名地点可能有多份实例（清单里一份、某一天里一份），
 * 它们是各自独立的 place_items，选中哪一份决定了这笔钱记在哪天。所以既保留了全部
 * 条目，也保留「来自哪里」那行小字来区分。详见下面 allItems 里的注释。
 */
export default function ItemPickerDialog({
  open,
  onOpenChange,
  selectedKey,
  onSelectItem,
  onSelectCategory,
}: ItemPickerDialogProps) {
  const {
    items,
    placeLists,
    days,
    containerOf,
    containerTitle,
    itemsInContainer,
  } = usePlaces();
  const { flights, hotels, trains } = useBookings();
  const [showAll, setShowAll] = useState(false);

  const allItems = useMemo<PickableItem[]>(() => {
    /** 地点实例 → 可选行。「来自哪里」就是它所在的容器，日期就是它所在的那天 */
    const toPickable = (item: PlaceItem): PickableItem => {
      const seed = inferFromPlace(item);
      const container = containerOf(item);
      return {
        key: `place-${item.id}`,
        name: seed.name,
        category: seed.category,
        origin: containerTitle(container),
        // 挂在清单里的实例没有日期（dayDate 为 null），选中后不预填日期
        date: item.dayDate ?? null,
        linkedItemType: "place",
        linkedItemId: item.id,
      };
    };

    /*
     * 顺序：照行程里的排法 —— 先各个地点列表（按列表自身顺序），再按天。
     * 某一天内部沿用 itemsInContainer 的 position 序。
     *
     * 不按名字去重。同一个地点可以同时在清单里和某一天里，那是 place_items 的
     * **两行**、各自独立，选哪一份决定了这笔钱记在哪天 —— 去掉重复项等于把这个
     * 选择权吞了（这也是"从预算里加"和"在卡片上点添加费用"结果不一样的根源）。
     * 区分靠 origin 那行小字。
     */
    const orderedContainers: PlaceContainer[] = [
      ...[...placeLists]
        .sort((a, b) => a.position - b.position)
        .map((list) => ({ kind: "list" as const, listId: list.id })),
      ...days.map((day) => ({ kind: "day" as const, dayDate: day.dayDate })),
    ];

    const placedIds = new Set<string>();
    const places: PickableItem[] = [];
    for (const container of orderedContainers) {
      for (const item of itemsInContainer(container)) {
        // 航班/住宿自动挂上去的机场、酒店实例不算 —— 它们的"本尊"在下面
        if (item.sourceKind != null) continue;
        placedIds.add(item.id);
        places.push(toPickable(item));
      }
    }
    /*
     * 兜底：行程没设日期范围时 days 是空的，挂在天上的实例走不到上面那圈；
     * 真出现这种数据也不该让它从列表里消失，补在最前面那批之后。
     */
    for (const item of items) {
      if (item.sourceKind != null || placedIds.has(item.id)) continue;
      places.push(toPickable(item));
    }

    const flightItems = flights.map<PickableItem>((flight) => {
      const seed = inferFromFlight(flight);
      const label = formatExpenseDate(flight.date);
      return {
        key: `flight-${flight.id}`,
        name: seed.name,
        category: seed.category,
        // 航班名字里已经有航线了，「来自哪里」能补的信息是它哪天飞
        origin: label ? `${label} 出发` : "航班",
        date: flight.date,
        linkedItemType: "flight",
        linkedItemId: flight.id,
      };
    });

    const trainItems = trains.map<PickableItem>((train) => {
      const seed = inferFromTrain(train);
      const label = formatExpenseDate(train.date);
      return {
        key: `train-${train.id}`,
        name: seed.name,
        category: seed.category,
        origin: label ? `${label} 出发` : "火车",
        // 上车站的乘车日（不是始发站发车日）：跨夜车的费用该记在上车那天
        date: train.date,
        linkedItemType: "train",
        linkedItemId: train.id,
      };
    });

    const hotelItems = hotels.map<PickableItem>((hotel) => {
      const seed = inferFromHotel(hotel);
      const label = formatExpenseDate(hotel.checkIn);
      return {
        key: `hotel-${hotel.id}`,
        name: seed.name,
        category: seed.category,
        origin: label ? `${label} 入住` : "住宿",
        date: hotel.checkIn,
        linkedItemType: "hotel",
        linkedItemId: hotel.id,
      };
    });

    // 顺序跟概览那一列对齐：火车在住宿前面
    return [...places, ...flightItems, ...trainItems, ...hotelItems];
  }, [
    items,
    placeLists,
    days,
    flights,
    hotels,
    trains,
    containerOf,
    containerTitle,
    itemsInContainer,
  ]);

  const preview = allItems.slice(0, PREVIEW_COUNT);

  /*
   * 从「查看全部」里选中一项：**先关掉这个全量弹窗再回填**。
   * showAll 是本组件的局部 state，外层处理完选择只会关掉本弹窗（onSelectItem
   * 里 setShowPicker(false)），没人管 showAll —— 于是选完还停在「所有行程项目」
   * 那一层，看着像没回到添加费用。两个 state 在同一次事件里改，React 会合到
   * 一次渲染，两层一起卸载。
   */
  const handleSelectFromAll = (item: PickableItem) => {
    setShowAll(false);
    onSelectItem(item);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-bold text-gray-900">
              选择项目
            </DialogTitle>
          </DialogHeader>

          {/* 上半：从行程里选 */}
          <div className="space-y-0.5">
            <p className="px-2 pb-1 text-base font-bold text-gray-900">
              从您的行程中选择
            </p>

            {preview.length === 0 ? (
              <p className="px-2 py-2 text-sm text-gray-400">
                行程里还没有项目，可以从下面按类别记一笔。
              </p>
            ) : (
              preview.map((item) => (
                <PickableItemRow
                  key={item.key}
                  item={item}
                  selected={item.key === selectedKey}
                  onSelect={() => onSelectItem(item)}
                />
              ))
            )}

            {/* 「查看全部」自己也是一行，样式跟上面那些项目一致（参照物如此） */}
            {allItems.length > PREVIEW_COUNT && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
                  <Ellipsis className="size-5 text-gray-600" />
                </span>
                <span className="text-sm text-gray-900">
                  查看全部（{allItems.length}）
                </span>
              </button>
            )}
          </div>

          <Separator />

          {/* 下半：按类别 */}
          <div className="space-y-2">
            <p className="px-2 text-base font-bold text-gray-900">
              或从类别中选择
            </p>
            <div className="grid grid-cols-4 gap-2">
              {EXPENSE_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => onSelectCategory(category)}
                  className="flex flex-col items-center gap-2 rounded-xl bg-gray-100 px-1 py-3 transition-colors hover:bg-gray-200"
                >
                  <CategoryIcon
                    category={category}
                    className="size-5 text-gray-700"
                  />
                  <span className="text-xs text-gray-600">{category}</span>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AllItemsDialog
        open={showAll}
        onOpenChange={setShowAll}
        items={allItems}
        selectedKey={selectedKey}
        onSelect={handleSelectFromAll}
      />
    </>
  );
}

