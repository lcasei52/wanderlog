"use client";

import { useEffect } from "react";
import { useAMap, MapMarker } from "@/hooks/useAMap";
import { PlaceWithList } from "@/types/place";
import { getColorByListId } from "@/lib/colors";

interface MapViewProps {
  places?: PlaceWithList[]; // 所有需要在地图上显示的地点
  destinationCenter?: [number, number]; // 行程目的地的中心坐标 [lng, lat]
}

export default function MapView({ places = [], destinationCenter }: MapViewProps) {
  // 计算地图初始中心点
  // 优先级：1. 目的地坐标 2. 第一个地点的坐标 3. 默认北京
  const getInitialCenter = (): [number, number] => {
    if (destinationCenter) {
      return destinationCenter;
    }
    if (places.length > 0 && places[0].location) {
      return [places[0].location.lng, places[0].location.lat];
    }
    return [116.397428, 39.90923]; // 默认北京
  };

  const { mapRef, map, isLoading, error, updateMarkers } = useAMap({
    zoom: 12,
    center: getInitialCenter(),
  });

  // 当地点列表变化时，更新地图标记
  useEffect(() => {
    if (!updateMarkers || places.length === 0) return;

    // 将地点转换为地图标记
    const markers: MapMarker[] = places
      .filter((place) => place.location) // 只显示有坐标的地点
      .map((place) => ({
        id: place.id,
        position: [place.location!.lng, place.location!.lat],
        label: `${place.displayIndex + 1}`, // 显示编号（从 1 开始）
        color: getColorByListId(place.listId), // 根据列表 ID 获取颜色
      }));

    updateMarkers(markers);
  }, [places, updateMarkers]);

  // 当目的地中心变化时，调整地图中心
  useEffect(() => {
    if (map && destinationCenter) {
      map.setCenter(destinationCenter);
    }
  }, [map, destinationCenter]);

  return (
    <div className="flex-1 bg-gray-100 relative">
      {/* 地图容器 */}
      <div ref={mapRef} className="w-full h-full" />

      {/* 加载状态 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-gray-600 text-sm">加载地图中...</p>
          </div>
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <p className="text-red-500 text-lg mb-2">地图加载失败</p>
            <p className="text-gray-500 text-sm">{error.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
