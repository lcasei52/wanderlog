import type { PlaceItem } from "@/types/place";

/**
 * 地点卡的"视觉种类"（由 place_items.source_kind 决定）：
 * - `place`  —— 用户手动加的地点：容器色圆形 + 容器内序号（与地图 marker 一致）；
 * - `flight` —— 航班自动挂上的机场：淡蓝底 + 蓝色飞机，**不带数字**；
 * - `hotel`  —— 住宿自动挂上的酒店：淡紫底 + 紫色房子，**不带数字**。
 *
 * 自动生成的两类为什么不要数字：它们不是"这天要逛的第几个景点"，序号对它们没有意义
 * （同一酒店一天还会首尾各挂一份）；用图标表明来源，比连号的数字更好认。
 */
export type PlaceKind = "place" | "flight" | "hotel";

/** 自动生成的两类（带图标）；手动地点单独处理 */
export type AutoPlaceKind = Exclude<PlaceKind, "place">;

export function placeKindOf(item: Pick<PlaceItem, "sourceKind">): PlaceKind {
  if (item.sourceKind === "flight") return "flight";
  if (item.sourceKind === "hotel") return "hotel";
  return "place";
}

/**
 * 自动生成地点的配色。卡片上的 mini 图标与地图 marker 共用这一份，
 * 保证两处颜色完全一致（淡色底 + 同色系深色图标）。
 */
export const AUTO_PLACE_COLORS: Record<
  AutoPlaceKind,
  { bg: string; fg: string }
> = {
  flight: { bg: "#3B82F6", fg: "#ffffff" }, // blue-500 / white
  hotel: { bg: "#8B5CF6", fg: "#ffffff" }, // violet-500 / white
};

/**
 * 地图 marker 内芯用的图标路径：与卡片上的 lucide 图标（Plane / Hotel）同一份数据，
 * 24×24 viewBox、描边线条（fill none）。颜色不写死，由外层的 stroke 给。
 * （地图 marker 是拼 SVG 字符串，用不了 React 组件，所以把路径抄了一份。）
 */
export const AUTO_PLACE_ICON_PATHS: Record<AutoPlaceKind, string[]> = {
  flight: [
    "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
  ],
  hotel: [
    // lucide Bed
    "M2 4v16",
    "M2 8h18a2 2 0 0 1 2 2v10",
    "M2 17h20",
    "M6 8v9",
  ],
};

/**
 * 该实例能不能在容器内拖动排序。
 * 酒店由"入住→退房每天首/尾各一份"的规则生成（见 HotelsList.addHotelItems），
 * 位置本身就是信息（早上在酒店 / 晚上回酒店），所以不给拖动柄、不给拖走 ——
 * 但别的卡仍可以拖到它前后。
 */
export function canDragPlace(item: Pick<PlaceItem, "sourceKind">): boolean {
  return placeKindOf(item) !== "hotel";
}
