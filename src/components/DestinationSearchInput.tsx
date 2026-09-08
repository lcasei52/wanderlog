"use client";

import { useState, useRef, useEffect } from "react";
import { MapPin, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

export interface DestinationResult {
  id: string;
  name: string;
  fullName: string; // 完整名称，如 "武汉市, 湖北省, 中国"
  type: "city" | "province" | "country"; // 地点类型
  location: {
    lng: number;
    lat: number;
  };
}

interface DestinationSearchInputProps {
  value?: string;
  onChange: (destination: DestinationResult) => void;
  placeholder?: string;
  className?: string;
}

/**
 * 判断一个 POI 是否为"国家 / 省份 / 城市"级别的行政地点，并返回其级别。
 *
 * 高德 PlaceSearch 返回的 POI 没有 typecode 字段，
 * 分类信息在 type 字段 —— 分号分隔的分类路径，行政地名一律以
 * "地名地址信息" 开头，末级就是行政级别，例如：
 *   地名地址信息;普通地名;省级地名    → 省 / 直辖市 / 自治区
 *   地名地址信息;普通地名;地市级地名  → 地级市
 * 开头不是 "地名地址信息" 的（机构、景点、商家等）以及
 * 区县级及更小的，一律排除。
 */
function getAdminLevel(poi: { type?: string }): DestinationResult["type"] | null {
  const s = poi.type || "";

  if (!s.includes("地名地址信息")) return null; // 不是行政地名，排除

  if (s.includes("省级")) return "province";
  if (s.includes("地市级") || s.includes("地级")) return "city";
  if (s.includes("国家级") || s.includes("国名") || s.includes("国别")) return "country";

  return null; // 区县级 / 乡镇级等更小的行政地名，排除
}

/**
 * 目的地搜索输入组件（支持城市、省份、国家）
 */
export default function DestinationSearchInput({
  value = "",
  onChange,
  placeholder = "例如：武汉、湖北、北京",
  className,
}: DestinationSearchInputProps) {
  const [searchQuery, setSearchQuery] = useState(value);
  const [results, setResults] = useState<DestinationResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 防抖搜索关键词（延迟 1 秒）
  const debouncedQuery = useDebounce(searchQuery, 1000);

  // 执行搜索
  useEffect(() => {
    const search = async () => {
      if (!debouncedQuery.trim()) {
        setResults([]);
        setIsSearching(false);
        setShowDropdown(false);
        return;
      }

      setIsSearching(true);

      try {
        // 设置安全密钥
        (window as any)._AMapSecurityConfig = {
          securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECRET || "",
        };

        // 动态导入高德地图 Loader
        const AMapLoader = (await import("@amap/amap-jsapi-loader")).default;

        // 加载高德地图 API
        const AMap = await AMapLoader.load({
          key: process.env.NEXT_PUBLIC_AMAP_KEY || "",
          version: "2.0",
          plugins: ["AMap.PlaceSearch", "AMap.Geocoder"],
        });

        // 使用 PlaceSearch 搜索地点
        const placeSearch = new AMap.PlaceSearch({
          // 不限制城市，支持全球搜索
          pageSize: 20, // 增加结果数量
          pageIndex: 1,
          extensions: "all", // 获取详细信息
        });

        placeSearch.search(debouncedQuery, (status: string, result: any) => {
          if (status === "complete" && result.poiList) {
            const pois = result.poiList.pois || [];

            const destinations: DestinationResult[] = pois
              .map((poi: any): DestinationResult | null => {
                const type = getAdminLevel(poi);
                if (!type || !poi.location) return null; // 只保留 国家/省/地级市

                // 构建完整名称，如 "武汉市, 湖北省, 中国"
                const parts = [];
                if (poi.pname && poi.pname !== poi.name) {
                  parts.push(poi.pname);
                }
                if (poi.cityname && poi.cityname !== poi.name && poi.cityname !== poi.pname) {
                  parts.push(poi.cityname);
                }
                const fullName =
                  parts.length > 0 ? `${poi.name}, ${parts.join(", ")}` : poi.name;

                return {
                  id: poi.id,
                  name: poi.name,
                  fullName,
                  type,
                  location: {
                    lng: poi.location.lng,
                    lat: poi.location.lat,
                  },
                };
              })
              .filter((d: DestinationResult | null): d is DestinationResult => d !== null);

            // 若搜索到了 POI 却被全部过滤，多半是国家/国外的分类词没匹配上，
            // 打印前几条真实 type 以便修正 getAdminLevel
            if (pois.length > 0 && destinations.length === 0) {
              console.warn(
                "目的地搜索全部被过滤，POI type 样例:",
                pois.slice(0, 5).map((p: any) => `${p.name}: ${p.type}`)
              );
            }

            setResults(destinations);
            setShowDropdown(destinations.length > 0);
          } else {
            setResults([]);
            setShowDropdown(false);
          }
          setIsSearching(false);
        });
      } catch (err) {
        console.error("目的地搜索失败:", err);
        setIsSearching(false);
        setResults([]);
        setShowDropdown(false);
      }
    };

    search();
  }, [debouncedQuery]);

  // 选择目的地
  const handleSelect = (destination: DestinationResult) => {
    setSearchQuery(destination.name);
    onChange(destination);
    setShowDropdown(false);
    inputRef.current?.blur();
  };

  // 清空
  const handleClear = () => {
    setSearchQuery("");
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 获取类型标签
  const getTypeLabel = (type: string) => {
    switch (type) {
      case "country":
        return "国家";
      case "province":
        return "省份";
      case "city":
        return "城市";
      default:
        return "";
    }
  };

  return (
    <>
      <div ref={containerRef} className={cn("relative", className)}>
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-gray-400 shrink-0" />
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (results.length > 0) {
                setShowDropdown(true);
              }
            }}
            placeholder={placeholder}
            className="flex-1"
          />
          {isSearching && (
            <Loader2 className="h-4 w-4 text-gray-400 animate-spin shrink-0" />
          )}
          {searchQuery && !isSearching && (
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 搜索结果下拉框 */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-white border border-gray-200 rounded-md shadow-lg max-h-[300px] overflow-y-auto"
          style={{
            top: containerRef.current
              ? containerRef.current.getBoundingClientRect().bottom + 4
              : 0,
            left: containerRef.current
              ? containerRef.current.getBoundingClientRect().left
              : 0,
            width: containerRef.current
              ? containerRef.current.getBoundingClientRect().width
              : 300,
          }}
        >
          {results.map((destination) => (
            <button
              key={destination.id}
              type="button"
              onClick={() => handleSelect(destination)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b last:border-b-0"
            >
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {destination.name}
                    </p>
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                      {getTypeLabel(destination.type)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {destination.fullName}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
