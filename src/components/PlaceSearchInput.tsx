"use client";

import { useState, useRef, useEffect } from "react";
import { MapPin, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlaceSearch, PlaceSearchResult } from "@/hooks/usePlaceSearch";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PlaceSearchInputProps {
  placeholder?: string;
  onPlaceSelect: (place: PlaceSearchResult) => void;
  onCancel?: () => void;
  className?: string;
}

/**
 * 带搜索下拉的地点输入组件
 */
export default function PlaceSearchInput({
  placeholder = "添加地点",
  onPlaceSelect,
  onCancel,
  className,
}: PlaceSearchInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { searchQuery, setSearchQuery, results, isSearching, clearResults } =
    usePlaceSearch();

  // 自动聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 选择地点
  const handleSelectPlace = (place: PlaceSearchResult) => {
    onPlaceSelect(place);
    setSearchQuery("");
    clearResults();
    setShowDropdown(false);
  };

  // 取消
  const handleCancel = () => {
    setSearchQuery("");
    clearResults();
    setShowDropdown(false);
    onCancel?.();
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
        handleCancel();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 显示下拉框的条件
  useEffect(() => {
    setShowDropdown(results.length > 0 || isSearching);
  }, [results, isSearching]);

  return (
    <>
      <div ref={containerRef} className={cn("relative", className)}>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                handleCancel();
              }
            }}
            placeholder={placeholder}
            className="flex-1 border-0 border-b border-gray-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-orange-300"
          />
          {isSearching && (
            <Loader2 className="h-4 w-4 text-gray-400 animate-spin flex-shrink-0" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={handleCancel}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 搜索结果下拉框 - 使用 Portal 渲染到 body，避免被父容器裁剪 */}
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
          {isSearching && results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">
              搜索中...
            </div>
          ) : results.length === 0 && searchQuery.trim() ? (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">
              未找到相关地点
            </div>
          ) : (
            results.map((place) => (
              <button
                key={place.id}
                onClick={() => handleSelectPlace(place)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b last:border-b-0"
              >
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {place.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {place.address}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </>
  );
}
