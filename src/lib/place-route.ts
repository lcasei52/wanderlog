/**
 * 地点之间的"路线"：模式定义 + 展示格式化 + 高德导航 URL。
 *
 * 这里只有纯函数（不碰 AMap 实例、不碰 DB）：
 * - 查路线（按需加载插件、解析结果）在 hooks/useAMapRoute.ts
 * - 在地图上画线在 hooks/useAMap.ts 的 setRoutePaths
 * - 读/写 route_plans 缓存在 db/route-plans.ts + actions/routes.ts
 * - 每个间隔用哪种方式、隐藏了哪些 在 context/routes-context.tsx
 */

export type RouteMode = "walking" | "transit" | "driving";

/**
 * 默认交通方式。
 * 车最不容易出丑：步行跨城会给出几十小时，公交跨城直接没有方案
 * （高德公交只支持同城）。「更改默认设置」做完之前先固定驾车。
 */
export const DEFAULT_ROUTE_MODE: RouteMode = "driving";

/** 下拉里三种模式的固定顺序（与卡片上那行图标一一对应） */
export const ROUTE_MODES: RouteMode[] = ["walking", "transit", "driving"];

export const ROUTE_MODE_LABEL: Record<RouteMode, string> = {
  walking: "步行",
  transit: "公交",
  driving: "驾车",
};

/**
 * 入库的路线缓存多久算过期。
 * 高德那边的路况/公交时刻一直在动，所以这个数只是"别把几年前的路线当现在用"，
 * 不是为了精确 —— 用户点「路线」时本来就是去高德页面看实时的，我们这里只是参考，
 * 所以给得宽松（重查一次要花配额，而配额是有限的）。
 */
export const ROUTE_CACHE_TTL_DAYS = 7;

/** 'walking'|'transit'|'driving' 之外的（脏数据 / null）一律不认 */
export function isRouteMode(v: unknown): v is RouteMode {
  return v === "walking" || v === "transit" || v === "driving";
}

/**
 * 从某份实例"到下一份实例"用哪种交通方式。
 * 存在起点卡上（place_items.route_mode_to_next），没设过 / 值坏了就用 fallback（行程默认）。
 * 之所以按起点卡读而不是按"间隔"读：拖动排序、换天之后这段路自动跟着起点走，
 * 不需要单独存一张"间隔表"，也不会有孤儿记录。
 */
export function routeModeOf(
  from: { routeModeToNext: string | null },
  fallback: RouteMode,
): RouteMode {
  return isRouteMode(from.routeModeToNext) ? from.routeModeToNext : fallback;
}

/** 高德导航页（uri.amap.com）的 mode 取值 */
const NAV_MODE: Record<RouteMode, string> = {
  walking: "walk",
  transit: "bus",
  driving: "car",
};

export interface RoutePoint {
  lng: number;
  lat: number;
  /** 起终点名称，导航页会显示（可省） */
  name?: string | null;
}

export interface RoutePlan {
  mode: RouteMode;
  distance: number; // 米
  time: number; // 秒
  /** 画线用的折线 [lng, lat][]；公交换乘段结构复杂，解析不出时为空数组 */
  path: [number, number][];
}

/**
 * route_plans 表里的一行（已转成领域对象）。
 * 放在这里而不是 db 层：db 负责产出它、context 负责消费它，
 * 形状定义在中间这个纯模块，两边都不用跨层 import。
 */
export interface CachedRoutePlan {
  /** 见下面的 routeKey */
  routeKey: string;
  /** null = 上次查出的是"高德没有方案"（负缓存），与"压根没这行（没查过）"是两回事 */
  plan: RoutePlan | null;
}

/** 地点（或任何带坐标的实例）→ 导航/查询用的点；没坐标就是 null（这段路没得算） */
export function routePointOf(item: {
  name: string;
  lng: number | null;
  lat: number | null;
}): RoutePoint | null {
  if (item.lng == null || item.lat == null) return null;
  return { lng: item.lng, lat: item.lat, name: item.name };
}

/**
 * 某个起点→终点+模式的键。
 * 内存缓存的键，也是 route_plans 的主键（配上 trip_id）——
 * 用四舍五入到 5 位小数的坐标（约 1 米）而不是卡片 id，所以拖动/复制/换天都还是它。
 */
export function routeKey(
  from: RoutePoint,
  to: RoutePoint,
  mode: RouteMode,
): string {
  const p = (x: RoutePoint) => `${x.lng.toFixed(5)},${x.lat.toFixed(5)}`;
  return `${p(from)}>${p(to)}|${mode}`;
}

/**
 * 一条"间隔"的身份：两个相邻实例的 id。
 * 只按 id 记，不带模式 —— 模式切换、隐藏、以及"地图上当前画的是哪条"都挂在它上面。
 */
export function gapKey(fromId: string, toId: string): string {
  return `${fromId}>${toId}`;
}

/** 耗时：`12 分钟` / `1 小时 20 分钟` */
export function formatDuration(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

/** 距离：`850 米` / `3.2 公里`（10 公里以上不再显示小数） */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} 米`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} 公里`;
}

/**
 * 起终点参数：`lng,lat,name`。
 * 用 encodeURIComponent 保证 & = ? 之类不会截断查询串，再把它转义掉的
 * `%2C` 还原成逗号 —— 高德这边是靠逗号分段的。
 */
function pointParam(p: RoutePoint): string {
  const name = p.name?.trim();
  const coords = `${p.lng},${p.lat}`;
  if (!name) return coords;
  return `${coords},${encodeURIComponent(name).replace(/%2C/gi, ",")}`;
}

/**
 * 高德"导航"页地址：手机上会尝试唤起高德 App，桌面打开网页版路线页。
 * 高德的路径规划 API 只给数据、不给导航界面，真要点开导航就走这个链接。
 */
export function amapNavigationUrl(
  from: RoutePoint,
  to: RoutePoint,
  mode: RouteMode,
): string {
  const q = [
    `from=${pointParam(from)}`,
    `to=${pointParam(to)}`,
    `mode=${NAV_MODE[mode]}`,
    "coordinate=gaode",
    "callnative=0",
    "src=wanderlog",
  ].join("&");
  return `https://uri.amap.com/navigation?${q}`;
}
