"use client";

import { Route, RouteOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getColorByListId } from "@/lib/colors";
import type { PlaceList } from "@/types/place";
import type { DayInfo } from "@/context/places-context";

interface MapLayerSelectorProps {
  /** 是否显示选择器 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 概览地点列表 */
  lists: PlaceList[];
  /** 行程天数 */
  days: DayInfo[];
  /** 选中的地点列表 ID 集合 */
  selectedListIds: Set<string>;
  /** 选中的天（day_date 字符串）集合 */
  selectedDayDates: Set<string>;
  /** 切换列表选中状态 */
  onToggleList: (listId: string) => void;
  /** 切换某天选中状态 */
  onToggleDay: (dayDate: string) => void;
  /** 全选 */
  onSelectAll: () => void;
  /** 取消全选 */
  onDeselectAll: () => void;
  /** 是否正在画线（行程间隔之间那些路线） */
  showRoutes: boolean;
  /** 切换"画线/不画线"（打开 = 打开的图层里所有间隔的线都画出来） */
  onToggleRoutes: () => void;
}

function LayerPin({ color }: { color: string }) {
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: color }}
    >
      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
      </svg>
    </div>
  );
}

export default function MapLayerSelector({
  open,
  onClose,
  lists,
  days,
  selectedListIds,
  selectedDayDates,
  onToggleList,
  onToggleDay,
  onSelectAll,
  onDeselectAll,
  showRoutes,
  onToggleRoutes,
}: MapLayerSelectorProps) {
  if (!open) return null;

  return (
    <>
      {/* 背景遮罩（点击关闭） */}
      <div className="absolute inset-0 bg-black/20 z-30" onClick={onClose} />

      {/* 选择器面板 */}
      <div className="absolute top-4 right-4 w-80 bg-white rounded-lg shadow-2xl z-40 max-h-[calc(100vh-120px)] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-lg font-semibold text-gray-900">地图图层</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* 全选/取消全选 */}
        <div className="flex items-center gap-4 px-4 py-3 border-b">
          <Button
            variant="link"
            size="sm"
            className="text-blue-600 hover:text-blue-700 p-0 h-auto"
            onClick={onSelectAll}
          >
            全选
          </Button>
          <Button
            variant="link"
            size="sm"
            className="text-blue-600 hover:text-blue-700 p-0 h-auto"
            onClick={onDeselectAll}
          >
            取消选择全部
          </Button>
        </div>

        {/* 内容区域（可滚动） */}
        <div className="flex-1 overflow-y-auto">
          {/* 概览列表 */}
          <div className="px-4 py-3">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">概览</h4>
            <div className="space-y-2">
              {lists.map((list) => (
                <label
                  key={list.id}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <LayerPin color={getColorByListId(list.id)} />
                  <span className="flex-1 text-sm text-gray-900 group-hover:text-gray-700">
                    {list.title}
                  </span>
                  <Checkbox
                    checked={selectedListIds.has(list.id)}
                    onCheckedChange={() => onToggleList(list.id)}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* 行程天数 */}
          {days.length > 0 && (
            <div className="px-4 py-3 border-t">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900">行程</h4>
                {/* 行程这一档的总开关：画/不画"间隔之间"的那些路线（无边框、蓝色） */}
                <Button
                  variant="ghost"
                  size="sm"
                  title={
                    showRoutes
                      ? "不显示任何路线"
                      : "把打开的图层里所有相邻地点之间的路线都画出来"
                  }
                  className="h-6 gap-1 px-1.5 text-xs font-normal text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  onClick={onToggleRoutes}
                >
                  {showRoutes ? (
                    <RouteOff className="h-3.5 w-3.5" />
                  ) : (
                    <Route className="h-3.5 w-3.5" />
                  )}
                  {showRoutes ? "隐藏路线" : "显示路线"}
                </Button>
              </div>
              <div className="space-y-2">
                {days.map((day) => (
                  <label
                    key={day.dayDate}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <LayerPin color={getColorByListId(`day-${day.dayDate}`)} />
                    <span className="flex-1 text-sm text-gray-900 group-hover:text-gray-700">
                      Day {day.dayNumber} · {day.label}
                    </span>
                    <Checkbox
                      checked={selectedDayDates.has(day.dayDate)}
                      onCheckedChange={() => onToggleDay(day.dayDate)}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
