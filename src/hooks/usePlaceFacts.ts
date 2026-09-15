"use client";

import { useEffect, useState } from "react";
import type { PlaceItem } from "@/types/place";

/**
 * 一个 POI 的补充信息（详情卡「地点信息」那块）。字段全是可选的 ——
 * 拿不到就不渲染那一行，绝不显示空壳。
 */
export interface PlaceFacts {
  // —— JSAPI getDetails 能给的 ——
  province?: string; // pname
  city?: string; // cityname
  district?: string; // adname
  businessArea?: string;
  /** 全部照片（加地点时只取了第一张，这里能拿到其余几张） */
  photos: string[];

  // —— 可选 REST 路径给的（要配 AMAP_WEB_KEY，见 api/place-detail）——
  rating?: string;
  cost?: string;
  openTime?: string;
}

/** 形如 "116.40,39.90" 的 groupKey —— 说明这行没有 AMap poi id，反查必然失败 */
const COORD_KEY = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

/**
 * 会话内缓存，按 poi id 存。这些是活数据（评分/营业时间会变），所以不落库 ——
 * 刷新页面重新拉一次就好。
 */
const cache = new Map<string, PlaceFacts>();

/** AMap 的字段什么都可能给：空串、空数组（★ rating 没有时高德真的会回 `[]`），一律当没有 */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/**
 * 查一个地点的补充信息。
 *
 * 只对**高德搜出来的地点**发请求：航班/酒店派生的行（sourceKind 有值）和
 * groupKey 是坐标的行都不是 POI，查了也是白查，直接跳过。
 */
export function usePlaceFacts(item: PlaceItem | null): {
  facts: PlaceFacts | null;
  loading: boolean;
} {
  const poiId =
    item && !item.sourceKind && item.groupKey && !COORD_KEY.test(item.groupKey)
      ? item.groupKey
      : null;

  const [facts, setFacts] = useState<PlaceFacts | null>(
    poiId ? (cache.get(poiId) ?? null) : null
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!poiId) {
      setFacts(null);
      setLoading(false);
      return;
    }
    const cached = cache.get(poiId);
    if (cached) {
      setFacts(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setFacts(null);
    setLoading(true);

    void (async () => {
      // 两条路互不依赖，各压各的错：REST 没配 key 就是空手而归，
      // 不该把 JSAPI 那几行也一起拖没
      const [base, rest] = await Promise.all([
        loadJsapiFacts(poiId).catch(() => null),
        loadRestFacts(poiId).catch(() => null),
      ]);
      if (cancelled) return;

      const merged: PlaceFacts = { photos: [], ...base, ...rest };
      cache.set(poiId, merged);
      setFacts(merged);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [poiId]);

  return { facts, loading };
}

/** JSAPI 路径：PlaceSearch.getDetails 按 poi id 反查 */
async function loadJsapiFacts(poiId: string): Promise<Partial<PlaceFacts> | null> {
  // 和 usePlaceSearch 一样，加载前先挂安全密钥
  (window as any)._AMapSecurityConfig = {
    securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECRET || "",
  };

  const AMapLoader = (await import("@amap/amap-jsapi-loader")).default;
  const AMap = await AMapLoader.load({
    key: process.env.NEXT_PUBLIC_AMAP_KEY || "",
    version: "2.0",
    plugins: ["AMap.PlaceSearch"],
  });

  const poi = await Promise.race([
    new Promise<any>((resolve) => {
      const placeSearch = new AMap.PlaceSearch({ extensions: "all" });
      // getDetails 的回调结果各版本形状略有出入，两条路都读一遍
      placeSearch.getDetails(poiId, (status: string, result: any) => {
        resolve(
          status === "complete"
            ? (result?.poiList?.pois?.[0] ?? result?.poi ?? null)
            : null
        );
      });
    }),
    // 万一它就是不回调（断网），别让 loading 一直转下去
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);
  if (!poi) return null;

  const photos: string[] = ((poi.photos ?? []) as any[])
    .map((p) => p?.url)
    .filter((u): u is string => typeof u === "string" && u !== "");

  return {
    province: str(poi.pname),
    city: str(poi.cityname),
    district: str(poi.adname),
    businessArea: str(poi.business_area),
    photos,
  };
}

/** REST 路径：拿 JSAPI 不给的 biz_ext。没配 AMAP_WEB_KEY 时路由回 {facts:null}，这里就当没有 */
async function loadRestFacts(poiId: string): Promise<Partial<PlaceFacts> | null> {
  const res = await fetch(`/api/place-detail?id=${encodeURIComponent(poiId)}`);
  if (!res.ok) return null;

  const data = await res.json();
  const f = data?.facts;
  if (!f) return null;

  return {
    rating: str(f.rating),
    cost: str(f.cost),
    openTime: str(f.openTime),
  };
}
