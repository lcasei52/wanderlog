"use client";

import { useState } from "react";
import { Hotel, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PlaceSearchInput from "@/components/PlaceSearchInput";
import type { PlaceSearchResult } from "@/hooks/usePlaceSearch";
import type { PlaceItemInput } from "@/types/place";
import type { DayInfo } from "@/context/places-context";
import { usePlaces } from "@/context/places-context";
import { useBookings } from "@/context/bookings-context";
import { buildGroupKey } from "@/lib/place-groups";
import { canDeletePlace, canDragPlace } from "@/lib/place-kinds";
import PlaceCard from "../PlaceCard";
import { PlaceDayGap } from "../PlaceGap";
import SortableCardGroup from "@/components/SortableCardGroup";

/** 行程里的"一天"：壳 + Day N 标题 + 挂到该天(day_date)的 PlaceCard + 搜索添加 */
export default function DayCard({ day }: { day: DayInfo }) {
  const { dayItemsByDate, addItem, deleteItem, reorderItems, days } = usePlaces();
  const { hotels, setExpanded } = useBookings();
  const [isAddingPlace, setIsAddingPlace] = useState(false);

  const places = dayItemsByDate(day.dayDate);

  /**
   * 这天晚上有没有地方睡。按"住店的那几晚"算：入住日 <= 今天 < 退房日
   * —— 退房当天人就走了，不算一晚。
   * 行程最后一天不需要住宿，所以那天不提醒。日期都是 "yyyy-MM-dd"，字符串直接比大小。
   */
  const isLastDay =
    days.length > 0 && days[days.length - 1].dayDate === day.dayDate;
  const hasHotelThatNight = hotels.some(
    (h) => h.checkIn <= day.dayDate && day.dayDate < h.checkOut,
  );
  // 只在这天已经有地点时才提这一句：空白天不啰嗦
  const showUnbooked = places.length > 0 && !isLastDay && !hasHotelThatNight;

  /** 滚到概览的 Hotels 那节。收起来的话先展开，否则滚过去只有一行标题 */
  const goToHotels = () => {
    setExpanded("hotels", true);
    document
      .getElementById("list-hotels")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handlePlaceSelect = (result: PlaceSearchResult) => {
    const input: PlaceItemInput = {
      groupKey: buildGroupKey(result),
      name: result.name,
      address: result.address ?? null,
      tel: result.tel ?? null,
      type: result.type ?? null,
      photo: result.photo ?? null,
      lng: result.location?.lng ?? null,
      lat: result.location?.lat ?? null,
    };
    addItem(input, { kind: "day", dayDate: day.dayDate });
    setIsAddingPlace(false);
  };

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-lg">Day {day.dayNumber}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>复制当日</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600 focus:text-red-600">
              删除当日
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-sm text-gray-500 mb-4">{day.label}</p>

      {/* 已排入当天的地点 */}
      {places.length > 0 && (
        <div className="mb-4">
          {/* 拖动排序只在本天内生效（position 按 day 容器重写） */}
          <SortableCardGroup
            ids={places.map((item) => item.id)}
            onReorder={reorderItems}
            onDelete={deleteItem}
            deleteTitle="从这天移除"
            // 酒店行按入住/退房逻辑固定在当天首/尾，不给拖动柄
            canDrag={(id) => {
              const it = places.find((p) => p.id === id);
              return it ? canDragPlace(it) : false;
            }}
            // 酒店行是住宿那一行的投影，生命周期归它管 —— 也不给垃圾桶
            canDelete={(id) => {
              const it = places.find((p) => p.id === id);
              return it ? canDeletePlace(it) : false;
            }}
            // 卡与卡之间：靠左一条竖向点线把当天行程"串"起来，靠右一行这段路的
            // 交通方式/耗时/距离 + 「路线」（间隔的起点 = 上一张卡，终点 = 下面这张卡）
            renderGap={(beforeId, index, dragging) => {
              const to = places.find((p) => p.id === beforeId);
              const from = places[index - 1];
              if (!from || !to) return null;
              return <PlaceDayGap from={from} to={to} dragging={dragging} />;
            }}
            renderItem={(id) => {
              const item = places.find((it) => it.id === id);
              return item ? <PlaceCard item={item} /> : null;
            }}
          />
        </div>
      )}

      {/* 这天还没订住宿：一行提示，点它滚到概览的 Hotels */}
      {showUnbooked && (
        <Button
          type="button"
          variant="outline"
          onClick={goToHotels}
          className="mb-4 h-auto w-full justify-start gap-2 border-dashed px-3 py-1.5 text-xs font-normal text-gray-400 hover:text-gray-600"
        >
          <Hotel className="h-3.5 w-3.5" />
          这天晚上还没有订住宿
        </Button>
      )}

      {/* 添加地点输入框或按钮 */}
      {isAddingPlace ? (
        <PlaceSearchInput
          placeholder="搜索并添加地点"
          onPlaceSelect={handlePlaceSelect}
          onCancel={() => setIsAddingPlace(false)}
          autoFocus
        />
      ) : (
        <Button
          variant="link"
          className="text-sm text-gray-400 hover:text-gray-600 p-0 h-auto"
          onClick={() => setIsAddingPlace(true)}
        >
          {places.length === 0 ? "还没有添加地点" : "+ 添加地点"}
        </Button>
      )}
    </div>
  );
}
