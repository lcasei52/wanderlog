"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
 * 带搜索下拉的地点输入组件。
 * 下拉结果用 Portal 渲染到 body + 视口坐标定位（fixed），
 * 这样即使输入框位于 Dialog / 滚动容器 / transform 祖先里，也不会被裁切或错位。
 */
export default function PlaceSearchInput({
  placeholder = "添加地点",
  onPlaceSelect,
  onCancel,
  className,
}: PlaceSearchInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
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

  // 显示下拉框的条件
  useEffect(() => {
    setShowDropdown(results.length > 0 || isSearching);
  }, [results, isSearching]);

  // 点外部（输入框容器 + 下拉之外）关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // 结果下拉是 portal 到 body 的、没结果时根本没渲染，此时 dropdownRef 为 null ——
      // 必须按"不在它里面"处理，否则下面整条判断恒为 false，点外部永远不关。
      const insideInput = containerRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!insideInput && !insideDropdown) {
        handleCancel();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 下拉框打开时测量输入框视口位置；滚动/缩放时跟随刷新
  useEffect(() => {
    if (!showDropdown) return;
    const updatePos = () => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    document.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      document.removeEventListener("scroll", updatePos, true);
    };
  }, [showDropdown]);

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

      {/* 搜索结果下拉框 - Portal 到 body + 视口 fixed 定位（不被 Dialog/滚动容器裁切）。
          注意必须 pointer-events-auto：Radix 的 modal Dialog 会把 body 设成 pointer-events:none
          （仅对弹窗内容恢复 auto），portal 到 body 的下拉会继承 none 而点不动结果；显式恢复才行。 */}
      {showDropdown &&
        pos &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] pointer-events-auto bg-white border border-gray-200 rounded-md shadow-lg max-h-[300px] overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
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
          </div>,
          document.body,
        )}
    </>
  );
}
