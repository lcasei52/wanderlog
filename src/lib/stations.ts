import type { StationOption } from "@/types/train";

/**
 * 火车站联想的客户端辅助（**只能在浏览器里用**）。
 *
 * 为什么打的是自家 /api/stations 而不是直接打高德：Web 服务 key 不能进客户端
 * bundle（见那个路由顶部的注释）。理由和 /api/places 那一套一样。
 *
 * 这一份是"锦上添花"：高德没配 key、或者请求挂了，站名照样能手打，只是没有城市
 * 和坐标（站点卡挂得上，但在地图上没位置）。所以下面每个函数都把失败当成
 * **可接受的降级**，不是错误路径 —— 手填是主路径。
 */

/** 只能 `GET /api/stations` 失败时抛；"查到了但没匹配"回空数组，那不是错误 */
export async function searchStations(
  keywords: string,
  city?: string | null,
): Promise<StationOption[]> {
  const params = new URLSearchParams({ keywords });
  if (city) params.set("city", city);

  const response = await fetch(`/api/stations?${params.toString()}`, {
    // 联想是"边打边查"，没有缓存的价值，也不该被缓存住
    cache: "no-store",
  });
  // 高德那条路由在出错时回的是 {stations: []}（200），所以非 OK 基本只有网络层
  // 和自己这边的 500 两种，都算"联想不可用"
  if (!response.ok) {
    throw new Error(`站点联想失败：${response.status}`);
  }

  const data = (await response.json()) as { stations?: StationOption[] };
  return Array.isArray(data.stations) ? data.stations : [];
}

/**
 * 把一个站名尽力解析成高德的站点（全称 + 城市 + 坐标）。
 *
 * 两个调用方，语义是同一条：
 *  - 手动填写里，用户从联想的 `StationOption`；手打、且正好等于表里的全称也认；
 *  - 自动填里，12306 给的站名（`宜昌北`）—— 高德那边叫 `宜昌北站`，**对不上名字
 *    是常态**，所以要退到"包含"再退到第一条。
 *
 * 名称匹配顺序：完全相同 → 互相包含 → 第一条（路由已经按"像不像查询词"排过序了）。
 * 一个都没查到就回 null —— 调用方据此退回 12306 的写法 / 裸站名。
 */
export async function resolveStation(
  picked: StationOption | null,
  typedName: string,
): Promise<StationOption | null> {
  if (picked) return picked;

  const name = typedName.trim();
  if (!name) return null;

  try {
    const stations = await searchStations(name);
    return (
      stations.find((s) => s.name === name) ??
      stations.find((s) => s.name.includes(name) || name.includes(s.name)) ??
      stations[0] ??
      null
    );
  } catch (err) {
    // 解析不出来不是错误：调用方会用 12306 的写法或用户手打的字面量兜住
    console.warn("站点解析失败，退回原始站名：", err);
    return null;
  }
}

/**
 * 联想结果 → 下拉选项。hint 放城市，用来区分「北京站 / 北京南站」这种同名不同站的。
 *
 * 返回类型**故意不 import `ComboOption`**：那个接口长在 AirportCombobox 里，而
 * lib 反过来依赖某个页面目录下的组件不成体统（虽然只是类型、编译后就没了）。
 * 这里的形状跟它结构兼容，调用方直接传就行 —— 哪天它变了，TS 会在调用点报错。
 */
export function toComboOptions(
  stations: StationOption[],
): { value: string; label: string; hint?: string }[] {
  return stations.map((s) => ({
    value: s.name,
    label: s.name,
    hint: s.city ?? undefined,
  }));
}
