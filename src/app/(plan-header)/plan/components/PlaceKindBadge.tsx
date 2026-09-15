"use client";

import { Hotel, Plane } from "lucide-react";
import { AUTO_PLACE_COLORS, placeKindOf } from "@/lib/place-kinds";
import type { PlaceItem } from "@/types/place";
import { cn } from "@/lib/utils";

interface PlaceKindBadgeProps {
  item: Pick<PlaceItem, "sourceKind">;
  /** 手动地点的容器内序号（自动生成的地点不看这个，可以不传） */
  number?: number;
  /** 手动地点的容器色（自动生成的地点不看这个，可以不传） */
  color?: string;
  className?: string;
}

/**
 * 地点行最左那个小圆标（卡片 / 详情卡 / 地图三处共用同一套观感）：
 * - 手动地点 → 容器色圆形 + 序号；
 * - 机场（航班生成）→ 淡蓝底 + 蓝色飞机；
 * - 酒店（住宿生成）→ 淡紫底 + 紫色房子。
 */
export default function PlaceKindBadge({
  item,
  number,
  color,
  className,
}: PlaceKindBadgeProps) {
  const kind = placeKindOf(item);

  if (kind !== "place") {
    const { bg, fg } = AUTO_PLACE_COLORS[kind];
    const Icon = kind === "flight" ? Plane : Hotel;
    return (
      <span
        className={cn(
          "h-5 w-5 rounded-full flex items-center justify-center shrink-0",
          className,
        )}
        style={{ backgroundColor: bg }}
        aria-label={kind === "flight" ? "机场" : "酒店"}
      >
        <Icon className="h-3 w-3" style={{ color: fg }} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "h-5 min-w-5 px-1 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0",
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {number}
    </span>
  );
}
