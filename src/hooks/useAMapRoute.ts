"use client";

import type { RouteMode, RoutePlan, RoutePoint } from "@/lib/place-route";

/**
 * 高德「路径规划」的按需封装：步行 / 公交 / 驾车三种服务，
 * 都吃现有的 Web端(JSAPI) key，不需要另外申请 Web服务 key。
 *
 * - 命名空间与各服务实例都只建一次（插件加载有开销，服务实例可复用）
 * - 不传 map 给服务，所以它只回数据、不会往地图上画任何东西（画线由 useAMap.setRoutePaths 统一做）
 * - 公交只支持同城，跨城会 no_data → 返回 null，由调用方显示"暂无方案"
 */

let amapPromise: Promise<any> | null = null;

/** 加载 AMap 命名空间（含三个路径规划插件）；失败不缓存，下次可重试 */
function loadAMap(): Promise<any> {
  if (amapPromise) return amapPromise;
  amapPromise = (async () => {
    (window as any)._AMapSecurityConfig = {
      securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECRET || "",
    };
    const AMapLoader = (await import("@amap/amap-jsapi-loader")).default;
    return AMapLoader.load({
      key: process.env.NEXT_PUBLIC_AMAP_KEY || "",
      version: "2.0",
      plugins: ["AMap.Walking", "AMap.Driving", "AMap.Transfer"],
    });
  })().catch((err) => {
    amapPromise = null;
    throw err;
  });
  return amapPromise;
}

/**
 * 每次查询都新建一个服务实例。
 * 不共用：同一个实例上并发发两次 search 会互相顶掉（后一次把前一次的结果掐断），
 * 而行程里多个间隔是同时在查同一种模式的。实例本身只是配置对象，建起来不花钱。
 */
function createService(AMap: any, mode: RouteMode, city?: string | null): any {
  // 不传 map，服务只回数据、不往地图上画东西
  if (mode === "walking") return new AMap.Walking({ hideMarkers: true });
  if (mode === "driving") return new AMap.Driving({ hideMarkers: true });
  // 公交必须有城市：不给就一律 no_data（试过删掉，公交全变"无方案"）。
  // 它只是个"去哪套公交库里查"的开关，并不校验是否与坐标同城 ——
  // 武汉的行程里查两个北京地点，传 "武汉" 照样出方案。
  return new AMap.Transfer({ hideMarkers: true, ...(city ? { city } : {}) });
}

/** 把回调式 search 包成 Promise；高德偶发不回调，超时按失败算，别让那一行永远停在"计算中" */
function search(
  service: any,
  mode: RouteMode,
  from: RoutePoint,
  to: RoutePoint,
): Promise<{ status: string; result: any }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: string, result: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, result });
    };
    const timer = setTimeout(() => finish("timeout", null), 12000);
    const callback = (status: string, result: any) => finish(status, result);

    try {
      const origin: [number, number] = [from.lng, from.lat];
      const destination: [number, number] = [to.lng, to.lat];
      // 驾车走 4 参重载（origin, destination, opts, callback），另两个是 3 参
      if (mode === "driving") service.search(origin, destination, {}, callback);
      else service.search(origin, destination, callback);
    } catch (err) {
      console.warn("路线查询失败:", err);
      finish("error", err);
    }
  });
}

/** 往 out 里追加一段折线（点可能是 LngLat 实例，也可能是 [lng,lat] 字面量） */
function pushPath(out: [number, number][], segment: any): void {
  if (!Array.isArray(segment)) return;
  for (const point of segment) {
    const lng = typeof point?.getLng === "function" ? point.getLng() : point?.lng;
    const lat = typeof point?.getLat === "function" ? point.getLat() : point?.lat;
    if (typeof lng === "number" && typeof lat === "number") {
      out.push([lng, lat]);
    }
  }
}

/**
 * 取第一个"存在且非空"的候选数组。
 * 同一份东西在文档/各版本里字段名不一样，但**同一份几何只会出现在其中一处** ——
 * 全都收就会把一段路画两遍（驾车那边 tmcs 的坑就是这么踩的），所以这里只挑一个。
 */
function firstArray(...candidates: any[]): any[] {
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate;
  }
  return [];
}

/**
 * 一个公交换乘段（segment）的折线。
 *
 * 高德把"这一段的坐标集合"放在哪儿，各版本/文档说法不一，所以按**整段优先、拆段兜底**取：
 *   1. `segment.transit.path` / `segment.path` —— 整段坐标集合。
 *      官方那份「规划结果 + 公交路线绘制」示例用的就是 segment.transit.path。
 *   2. 没给整段时才按子段拼：步行子段 + 公交线路段 + 铁路/打车段。
 *      这几类互不重叠，可以一起收。
 * 每一类都可能挂在 `segment.X` 或 `segment.transit.X` 下（2.0 把换乘信息嵌在 transit 里），
 * 所以每类都用 firstArray 在候选里挑一个非空的。
 *
 * 之前只认 `segment.bus.buslines` / `segment.walking.steps`（都是段级），
 * 实际返回里这两处是空的 → 公交有时间距离却一条线都画不出来。
 */
function transitSegmentPath(segment: any): [number, number][] {
  const out: [number, number][] = [];
  const transit = segment?.transit;

  const whole = firstArray(transit?.path, segment?.path);
  if (whole.length > 0) {
    pushPath(out, whole);
    return out;
  }

  for (const step of firstArray(
    segment?.walking?.steps,
    transit?.walking?.steps,
  )) {
    pushPath(out, step?.path);
  }
  for (const line of firstArray(
    segment?.bus?.buslines,
    transit?.buslines,
    transit?.lines, // 1.4 换乘段里的公交线路集合
  )) {
    pushPath(out, line?.path);
  }
  pushPath(out, firstArray(segment?.railway?.path, transit?.railway?.path));
  pushPath(out, firstArray(segment?.taxi?.path, transit?.taxi?.path));
  return out;
}

/**
 * 取结果的几何折线 —— 只认明确列出的那几个位置，不做"递归抓所有 path"。
 *
 * 踩过的坑：驾车结果的每个 step 除了 `path` 还有个 `tmcs`（路况分段），
 * tmcs 里也有 `path` 且采样更密。盲抓会把同一段路画两遍 ——
 * 两遍的点疏密不同，看起来就是两条线、还像"往返"。
 */
function extractPath(mode: RouteMode, route: any): [number, number][] {
  const path: [number, number][] = [];

  if (mode === "transit") {
    // 公交换乘方案：一个换乘段一段，按顺序拼起来
    for (const segment of route.segments ?? []) {
      for (const point of transitSegmentPath(segment)) path.push(point);
    }
    return path;
  }

  // 驾车 / 步行：每个子路段一段，按顺序拼起来就是整条路线
  for (const step of route.steps ?? []) pushPath(path, step.path);
  return path;
}

/** 结果 → RoutePlan；取不到方案返回 null（公交跨城就是这条路） */
function toPlan(mode: RouteMode, result: any): RoutePlan | null {
  // 驾车/步行在 routes[0]，公交在 plans[0]
  const route = mode === "transit" ? result?.plans?.[0] : result?.routes?.[0];
  if (!route) return null;

  const distance = Number(route.distance);
  const time = Number(route.time);
  const path = extractPath(mode, route);

  // 公交有方案（有时长距离）却一条折线都没解析出来 → 说明这个版本把几何放在了
  // 我们还没认的字段上。只在这种情况下打一行（不刷屏），把第一个换乘段原样丢出来，
  // 照着往 transitSegmentPath 里补一个候选就行。
  if (mode === "transit" && path.length === 0) {
    console.warn("公交方案没解析出折线，第一个换乘段的结构：", route.segments?.[0]);
  }

  return {
    mode,
    distance: Number.isFinite(distance) ? distance : 0,
    time: Number.isFinite(time) ? time : 0,
    path,
  };
}

/**
 * 一次路线查询的结果。
 *
 * 必须把"高德明确说没有方案"和"查询本身失败了"分开：
 * 前者是可以入库的负缓存（跨城公交就是这种，重查一百次也一样没有），
 * 后者（超时 / 插件没加载起来 / 网络抖动）一旦入库，这条路线就会
 * 带着"无方案"的样子躺到过期为止 —— 那比不缓存还糟。
 */
export type RouteQueryResult =
  | { ok: true; plan: RoutePlan | null } // ok 且 plan 为 null = 高德没给方案
  | { ok: false }; // 没问出结果，别记

/**
 * 查一次路线。`city` 只有公交用得上：整趟行程的城市（见 routes-context 的 city）。
 */
export async function requestRoutePlan(
  from: RoutePoint,
  to: RoutePoint,
  mode: RouteMode,
  city?: string | null,
): Promise<RouteQueryResult> {
  try {
    const AMap = await loadAMap();
    const service = createService(AMap, mode, city);
    const { status, result } = await search(service, mode, from, to);
    // complete = 有方案；no_data = 高德确认没有；其余（error/timeout）都不算数
    if (status === "no_data") return { ok: true, plan: null };
    if (status !== "complete") return { ok: false };
    return { ok: true, plan: toPlan(mode, result) };
  } catch (err) {
    console.warn("路线规划失败:", err);
    return { ok: false };
  }
}
