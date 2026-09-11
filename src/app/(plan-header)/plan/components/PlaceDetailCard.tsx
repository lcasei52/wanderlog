"use client";

import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Layers,
  MapPin,
  Phone,
  Tag,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PlaceContainer, PlaceItem } from "@/types/place";
import { usePlaces } from "@/context/places-context";
import { getColorByListId } from "@/lib/colors";
import VisitedButton, { visitedToggleFeedback } from "./VisitedButton";
import PlaceKindBadge from "./PlaceKindBadge";
import { cn } from "@/lib/utils";

interface PlaceDetailCardProps {
  /** 缩放至某地点（由 MapView 注入；实现会把该点放到上半屏） */
  zoomToPlace?: (position: [number, number], zoom?: number) => void;
}

/** 两实例是否同属一个容器 */
function inContainer(item: PlaceItem, container: PlaceContainer): boolean {
  return container.kind === "list"
    ? item.listId === container.listId
    : item.dayDate === container.dayDate;
}

/**
 * 浮在地图列底部的"地点详情"卡：展示当前选中的一份地点实例，
 * 顶部工具条 = 「N个中的第M个」前后切换 + 缩放至此地点；
 * 正文 = 图片/详情 + 已访问开关 + 「属于哪些图层」下拉（勾选=复制一份过去、取消=删除该图层那份）。
 */
export default function PlaceDetailCard({ zoomToPlace }: PlaceDetailCardProps) {
  const {
    item,
    selectedItemId,
    placeLists,
    days,
    peers,
    itemsInContainer,
    containerOf,
    itemNumber,
    itemColor,
    containerTitle,
    selectItem,
    clearSelection,
    copyItemTo,
    deleteItem,
    updateItem,
  } = usePlaces();

  if (!selectedItemId) return null;
  const cur = item(selectedItemId);
  if (!cur) return null;

  // 当前容器内的全部实例（按行序 1..N），用于"第 M 个 / 共 N 个"前后切换
  const containerItems = itemsInContainer(containerOf(cur));
  const curIndex = containerItems.findIndex((it) => it.id === cur.id);
  const total = containerItems.length;
  const showNav = total > 1;
  const prevItem = curIndex > 0 ? containerItems[curIndex - 1] : null;
  const nextItem = curIndex < total - 1 ? containerItems[curIndex + 1] : null;

  const myPeers = peers(cur);

  const layerOptions: {
    key: string;
    label: string;
    color: string;
    container: PlaceContainer;
    present: boolean;
  }[] = [
    ...placeLists.map((l) => ({
      key: `list:${l.id}`,
      label: l.title,
      color: getColorByListId(l.id),
      container: { kind: "list", listId: l.id } as PlaceContainer,
      present: myPeers.some((p) => p.listId === l.id),
    })),
    ...days.map((d) => ({
      key: `day:${d.dayDate}`,
      label: `Day ${d.dayNumber} · ${d.label}`,
      color: getColorByListId(`day-${d.dayDate}`),
      container: { kind: "day", dayDate: d.dayDate } as PlaceContainer,
      present: myPeers.some((p) => p.dayDate === d.dayDate),
    })),
  ];

  const presentTitles = layerOptions.filter((o) => o.present).map((o) => o.label);

  const applyLayer = async (container: PlaceContainer, checked: boolean) => {
    if (checked) {
      // 勾选新图层 = 复制一份实例过去（含笔记/时间/附件/已访问，同 #4）
      const copied = await copyItemTo(cur.id, container);
      if (copied) {
        toast.success(`已复制到「${containerTitle(container)}」`);
      }
      return;
    }
    // 取消勾选 = 删掉该图层下的全部同 POI 实例
    const removing = myPeers.filter((p) => inContainer(p, container));
    for (const p of removing) {
      await deleteItem(p.id);
    }
    if (removing.some((p) => p.id === cur.id)) {
      const survivor = myPeers.find(
        (p) => !removing.some((r) => r.id === p.id)
      );
      if (survivor) {
        toast.info("已移除，切换到同一地点的另一份实例");
        selectItem(survivor.id);
      } else {
        toast.success("已移除");
        clearSelection();
      }
    } else {
      toast.success("已移除");
    }
  };

  const toggleVisited = () => {
    const wasVisited = cur.visited;
    updateItem(cur.id, { visited: !wasVisited });
    visitedToggleFeedback(wasVisited);
  };

  const infoRows: { icon: React.ReactNode; text: string }[] = [];
  if (cur.address)
    infoRows.push({ icon: <MapPin className="h-4 w-4" />, text: cur.address });
  if (cur.tel) infoRows.push({ icon: <Phone className="h-4 w-4" />, text: cur.tel });
  if (cur.type) infoRows.push({ icon: <Tag className="h-4 w-4" />, text: cur.type });

  const number = itemNumber(cur);
  const color = cur.visited ? "#94a3b8" : itemColor(cur);

  const navBtn =
    "h-7 px-2 gap-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="absolute inset-0 z-20 flex justify-center px-4 pb-4 overflow-hidden pointer-events-none">
      {/* h-full：让内层占满地图列高度，卡片的 max-h-[55%] 才有确定参照系，
          内容超高时在正文里滚动而不是撑破/裁掉 */}
      <div className="flex h-full w-full max-w-lg flex-col items-center justify-end gap-2">
        {/* 工具条：前后切换 + 缩放至此地点 */}
        <div className="flex items-center rounded-full border border-gray-200 bg-white px-1.5 py-1 shadow-lg pointer-events-auto">
          {showNav ? (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className={navBtn}
                aria-label="上一个地点"
                disabled={!prevItem}
                onClick={() => prevItem && selectItem(prevItem.id)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-1 text-xs text-gray-600 whitespace-nowrap">
                {total}个中的第{curIndex + 1}个
              </span>
              <Button
                variant="ghost"
                size="sm"
                className={navBtn}
                aria-label="下一个地点"
                disabled={!nextItem}
                onClick={() => nextItem && selectItem(nextItem.id)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="mx-1 h-4 w-px bg-gray-200" />
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className={cn(navBtn, "h-7")}
            aria-label="缩放至此地点"
            title="缩放至此地点（放到地图上半屏）"
            disabled={cur.lng == null || cur.lat == null || !zoomToPlace}
            onClick={() =>
              cur.lng != null && cur.lat != null && zoomToPlace?.([cur.lng, cur.lat])
            }
          >
            <Crosshair className="h-3.5 w-3.5" />
            缩放至此地点
          </Button>
        </div>

        <Card className="w-full pointer-events-auto shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[55%] min-h-0">
          {/* 图片区 */}
          <div className="relative h-36 flex-shrink-0 bg-gradient-to-br from-orange-200 to-amber-100">
            {cur.photo ? (
              // AMap 图片域名，用原生 img 绕开 next/image 远程白名单
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cur.photo}
                alt={cur.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <MapPin className="h-10 w-10" />
              </div>
            )}

            <Button
              variant="secondary"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-sm"
              aria-label="关闭详情"
              onClick={clearSelection}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* 正文 */}
          <div className="p-4 overflow-y-auto space-y-4 min-h-0">
            {/* 标题行 + 已访问开关 */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {/* 机场/酒店自动生成的地点用来源图标，其余用容器色 + 序号 */}
                  <PlaceKindBadge item={cur} number={number} color={color} />
                  <h3 className="text-lg font-semibold text-gray-900 leading-snug wrap-break-word">
                    {cur.name}
                  </h3>
                </div>
                {myPeers.length > 1 && (
                  <p className="text-xs text-gray-400 mt-1">
                    同地点在 {myPeers.length} 个容器各有实例
                  </p>
                )}
              </div>
              <VisitedButton
                visited={cur.visited}
                onToggle={toggleVisited}
                className="flex-shrink-0"
              />
            </div>

            {/* 详细信息 */}
            {infoRows.length > 0 && (
              <div className="space-y-1.5 text-sm text-gray-600">
                {infoRows.map((row, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-gray-400 flex-shrink-0 mt-0.5">
                      {row.icon}
                    </span>
                    <span className="wrap-break-word">{row.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 属于哪些图层 */}
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-gray-700"
                  >
                    <Layers className="h-4 w-4" />
                    属于哪些图层
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto">
                  <DropdownMenuLabel>
                    勾选让该地点也出现在其他图层（复制一份）
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {layerOptions.map((o) => (
                    <DropdownMenuCheckboxItem
                      key={o.key}
                      checked={o.present}
                      onCheckedChange={(checked) =>
                        applyLayer(o.container, Boolean(checked))
                      }
                      onSelect={(e) => e.preventDefault()}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-3.5 w-3.5 rounded-full inline-block flex-shrink-0"
                          style={{ backgroundColor: o.color }}
                        />
                        {o.label}
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {presentTitles.length > 0 && (
                <p className="text-xs text-gray-500 flex-1 min-w-0">
                  出现在：{presentTitles.join("、")}
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
