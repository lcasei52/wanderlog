import type {
  List as SchemaList,
  NewList as SchemaNewList,
  PlaceItem as SchemaPlaceItem,
  NewPlaceItem as SchemaNewPlaceItem,
} from "@/db/schema";

/**
 * 地点相关类型 —— "地点实例"模型。
 *
 * 一个"地点"(PlaceItem) 只属于一个容器（某个地点列表，或行程中某天，见 place_items
 * 表的 CHECK）。同一个 POI 想同时出现在多个容器，就在目标容器各持一份独立实例
 * （复制）；groupKey 把同 POI 的多份实例归并，供 PlaceDetailCard 查询"出现在哪些图层"。
 *
 * Notes / Flights / Hotels 不是地点列表（不占 lists 表），它们各有内容表直接归属 trip。
 * lists 表只存用户的地点列表（含每 trip 的默认 "Places to visit"）。
 */

/** 一份地点实例 = place_items 的一行 */
export type PlaceItem = SchemaPlaceItem;
export type NewPlaceItem = SchemaNewPlaceItem;
export type PlaceItemRow = PlaceItem;
export type NewPlaceItemRow = NewPlaceItem;

/** 一个地点列表（lists 行） */
export type PlaceList = SchemaList;
export type NewPlaceList = SchemaNewList;
export type PlaceListRow = PlaceList;
export type NewPlaceListRow = NewPlaceList;

/** 一个高德搜索结果 / AMap POI（新地点的来源），id 为 AMap poi id */
export interface PlacePoi {
  id: string; // AMap poi id（用作 groupKey）
  name: string;
  address?: string;
  location?: {
    lng: number;
    lat: number;
  };
  tel?: string;
  type?: string;
  photo?: string | null;
}

/** 新增/复制一份地点实例的输入（对应 place_items 可编辑快照列） */
export interface PlaceItemInput {
  groupKey: string; // sourceId ?? `${lng},${lat}` ?? name
  name: string;
  address?: string | null;
  tel?: string | null;
  type?: string | null;
  photo?: string | null;
  lng?: number | null;
  lat?: number | null;
  note?: string;
  timeFrom?: string | null; // "HH:mm"
  timeTo?: string | null; // "HH:mm"
  url?: string | null;
  visited?: boolean;
  /** 自动生成来源：航班/酒店挂的地点带 ('flight'|'hotel', 父行 id)；手动加的不带 */
  sourceKind?: string | null;
  sourceId?: string | null;
}

/** 一份实例的"容器"：挂在某个地点列表，或挂在行程中某天 */
export type PlaceContainer =
  | { kind: "list"; listId: string }
  | { kind: "day"; dayDate: string };

/**
 * 图层键：地点列表是 `l:<listId>`，某一天是 `d:<dayDate>`。
 * 三处用的是同一套键，所以放这里共用，免得各写一份慢慢漂移：
 * - 地图"哪些图层可见"（存在 trips.hidden_layers）
 * - 容器键（places-context 里按容器分组）
 * - 高德地图图层选择器的勾选项
 */
export const listLayerKey = (listId: string): string => `l:${listId}`;
export const dayLayerKey = (dayDate: string): string => `d:${dayDate}`;

/** 可编辑字段的补丁（updateItem 用） */
export type PlaceItemPatch = Partial<
  Pick<
    PlaceItem,
    | "name"
    | "address"
    | "tel"
    | "type"
    | "photo"
    | "lng"
    | "lat"
    | "note"
    | "timeFrom"
    | "timeTo"
    | "url"
    | "visited"
    | "position"
    /** 到"下一份实例"的交通方式（见 schema 的 route_mode_to_next） */
    | "routeModeToNext"
  >
>;

/** 行程内从 1 起的第 N 天（做 day 序号/展示用，容器 key 仍是 dayDate 字符串） */
export type DayNumber = number;
