"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
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
import { buildGroupKey } from "@/lib/place-groups";
import { canDragPlace } from "@/lib/place-kinds";
import PlaceCard from "../PlaceCard";
import { PlaceDayGap } from "../PlaceGap";
import SortableCardGroup from "@/components/SortableCardGroup";

/** 行程里的"一天"：壳 + Day N 标题 + 挂到该天(day_date)的 PlaceCard + 搜索添加 */
export default function DayCard({ day }: { day: DayInfo }) {
  const { dayItemsByDate, addItem, deleteItem, reorderItems } = usePlaces();
  const [isAddingPlace, setIsAddingPlace] = useState(false);

  const places = dayItemsByDate(day.dayDate);

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
            // 酒店卡按入住/退房逻辑固定在当天首/尾，不给拖动柄
            canDrag={(id) => {
              const it = places.find((p) => p.id === id);
              return it ? canDragPlace(it) : false;
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

      {/* 添加地点输入框或按钮 */}
      {isAddingPlace ? (
        <PlaceSearchInput
          placeholder="搜索并添加地点"
          onPlaceSelect={handlePlaceSelect}
          onCancel={() => setIsAddingPlace(false)}
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
