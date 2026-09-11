/**
 * group_key 计算：把同 POI 的多份实例（列表/不同天里的副本）归并为同一组。
 * 归并顺序：AMap poi id > 坐标 > 名称。
 * 入参兼容 PlacePoi（含 location）与纯字段对象（机场/酒店等无 id 来源）。
 */
export function buildGroupKey(input: {
  id?: string | null;
  location?: { lng: number; lat: number } | null;
  lng?: number | null;
  lat?: number | null;
  name: string;
}): string {
  if (input.id?.trim()) return input.id.trim();
  const location = input.location;
  const lng = location?.lng ?? input.lng;
  const lat = location?.lat ?? input.lat;
  if (typeof lng === "number" && typeof lat === "number" && !Number.isNaN(lng) && !Number.isNaN(lat)) {
    // 小数截到 ~1e-4 量级再归并，避免坐标浮点尾差拆成不同组
    return `${lng.toFixed(5)},${lat.toFixed(5)}`;
  }
  return input.name.trim() || "unknown";
}
