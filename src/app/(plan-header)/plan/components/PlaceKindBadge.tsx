"use client";

import {
  AUTO_PLACE_COLORS,
  AUTO_PLACE_ICONS,
  placeKindOf,
  type AutoPlaceKind,
} from "@/lib/place-kinds";
import type { PlaceItem } from "@/types/place";
import { cn } from "@/lib/utils";

interface PlaceKindBadgeProps {
  item: Pick<PlaceItem, "sourceKind">;
  /** 手动地点的容器内序号（自动生成的地点不看这个，可以不传） */
  number?: number;
  /** 手动地点的容器色（自动生成的地点不看这个，可以不传） */
  color?: string;
  /**
   * 外形：
   * - `dot`（默认）圆标 —— 详情卡标题行里那个；
   * - `pin` 雨滴图钉 —— 地点卡最左那个。卡片上是"地图上的一站"，图钉比圆标更贴。
   *
   * 两种外形**都以外框盒子的中心为圆心**，调用方按中心摆就行（PlaceCard 就是按
   * "中心压在卡片左沿"摆的）。
   */
  variant?: "dot" | "pin";
  className?: string;
}

/**
 * 自动生成的那几类的无障碍名称。写在组件里而不是 place-kinds.ts：那是屏幕阅读器
 * 播报用的界面文案，跟配色/图标那种"视觉常量"不是一回事。
 * 用 `Record<AutoPlaceKind, …>` 是为了让"加了新种类忘了加文案"变成编译错误 ——
 * 以前这里是个 `kind === "flight" ? "机场" : "酒店"` 的三元，加第三种时它只会
 * 默默播报成"酒店"。
 */
const AUTO_PLACE_LABELS: Record<AutoPlaceKind, string> = {
  flight: "机场",
  hotel: "酒店",
  train: "车站",
};

/**
 * 地点行最左那个小标（卡片 / 详情卡 / 地图三处共用同一套观感）：
 * - 手动地点 → 容器色 + 序号；
 * - 机场（航班生成）→ 蓝底 + 白色飞机；
 * - 酒店（住宿生成）→ 紫底 + 白色房子；
 * - 车站（火车生成）→ 绿底 + 白色火车。
 */
export default function PlaceKindBadge({
  item,
  number,
  color,
  variant = "dot",
  className,
}: PlaceKindBadgeProps) {
  const kind = placeKindOf(item);
  const pin = variant === "pin";

  /*
   * 盒子。圆标自己就是那个圆（底色直接给盒子），雨滴只占地盘 —— 形状在下面那层
   * 转着画。两种外形的圆心都是这个盒子的中心。
   *
   * 圆标是 h-5 + min-w-5 + px-1：两位数的序号会把胶囊撑宽，序号多到两位数也放得下。
   * 雨滴只能是正圆头，宽度写死 h-6 w-6。
   */
  const box = cn(
    "relative flex items-center justify-center shrink-0",
    pin ? "h-6 w-6" : "h-5 min-w-5 px-1 rounded-full",
    className,
  );

  /*
   * 雨滴形：一个正方形只把三个角磨圆、左下角留尖，再**逆时针转 45°** 把尖转到正下方。
   * 那三个圆角的半径都是边长的一半、圆心全落在方块正中，所以"水滴头"就是个直径等于
   * 边长的正圆、圆心正好是盒子中心；尖戳在中心下方 0.707 × 边长处（在盒子**外面**，
   * 盒子只有半个边长那么高），靠不裁切画出去 —— **祖先别加 overflow-hidden**，尖会没。
   *
   * 序号/图标不能住这一层：转了 45° 的坐标系会把它们一起扭了。它们留在盒子那层居中，
   * 落点正好是水滴头的圆心。
   */
  const droplet = (fill: string | undefined) =>
    pin ? (
      <span
        aria-hidden
        className="absolute inset-0 -rotate-45 rounded-[50%_50%_50%_0]"
        style={{ backgroundColor: fill }}
      />
    ) : null;

  if (kind !== "place") {
    const { bg, fg } = AUTO_PLACE_COLORS[kind];
    const Icon = AUTO_PLACE_ICONS[kind];
    return (
      <span
        className={box}
        // 雨滴的底色在那层形状上（盒子本身是透明的，不然会露出一个方块）
        style={pin ? undefined : { backgroundColor: bg }}
        aria-label={AUTO_PLACE_LABELS[kind]}
      >
        {droplet(bg)}
        <Icon className="relative h-3 w-3" style={{ color: fg }} />
      </span>
    );
  }

  return (
    <span className={box} style={pin ? undefined : { backgroundColor: color }}>
      {droplet(color)}
      <span className="relative text-[11px] font-bold text-white">{number}</span>
    </span>
  );
}
