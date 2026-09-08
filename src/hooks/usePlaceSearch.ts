"use client";

import { useState, useEffect } from "react";
import { useDebounce } from "./useDebounce";

export interface PlaceSearchResult {
  id: string;
  name: string;
  address: string;
  location: {
    lng: number;
    lat: number;
  };
}

/**
 * 高德地图地点搜索 Hook
 */
export function usePlaceSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 防抖搜索关键词（延迟 1 秒）
  const debouncedQuery = useDebounce(searchQuery, 1000);

  // 当防抖后的查询词改变时，执行搜索
  useEffect(() => {
    const search = async () => {
      if (!debouncedQuery.trim()) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setError(null);

      try {
        console.log("开始搜索:", debouncedQuery);

        // 设置安全密钥
        (window as any)._AMapSecurityConfig = {
          securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECRET || "",
        };

        // 动态导入高德地图 Loader
        const AMapLoader = (await import("@amap/amap-jsapi-loader")).default;

        // 加载高德地图 API（包含 PlaceSearch 插件）
        const AMap = await AMapLoader.load({
          key: process.env.NEXT_PUBLIC_AMAP_KEY || "",
          version: "2.0",
          plugins: ["AMap.PlaceSearch"],
        });

        // 创建地点搜索实例
        const placeSearch = new AMap.PlaceSearch({
          pageSize: 10,
          pageIndex: 1,
        });

        // 执行搜索
        placeSearch.search(debouncedQuery, (status: string, result: any) => {
          console.log("搜索状态:", status, "结果:", result);

          if (status === "complete" && result.poiList) {
            const pois = result.poiList.pois || [];
            const searchResults: PlaceSearchResult[] = pois.map((poi: any) => ({
              id: poi.id,
              name: poi.name,
              address: poi.address || poi.pname + poi.cityname + poi.adname,
              location: {
                lng: poi.location.lng,
                lat: poi.location.lat,
              },
            }));
            console.log("搜索到", searchResults.length, "个结果");
            setResults(searchResults);
          } else {
            console.log("没有搜索结果");
            setResults([]);
          }
          setIsSearching(false);
        });
      } catch (err) {
        console.error("地点搜索失败:", err);
        setError(err instanceof Error ? err : new Error("搜索失败"));
        setIsSearching(false);
        setResults([]);
      }
    };

    search();
  }, [debouncedQuery]);

  return {
    searchQuery,
    setSearchQuery,
    results,
    isSearching,
    error,
    clearResults: () => setResults([]),
  };
}
