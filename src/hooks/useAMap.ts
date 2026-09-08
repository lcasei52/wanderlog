"use client";

import { useEffect, useRef, useState } from "react";

interface UseAMapOptions {
  zoom?: number;
  center?: [number, number];
  pitch?: number;
}

export interface MapMarker {
  id: string;
  position: [number, number]; // [lng, lat]
  label: string;
  color: string;
}

export function useAMap(options: UseAMapOptions = {}) {
  const mapRef = useRef<HTMLDivElement>(null);
  // 高德 loader 未提供全局 AMap 命名空间类型，这里用 any 接收地图实例
  const [map, setMap] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;

    const initMap = async () => {
      try {
        setIsLoading(true);

        // 设置安全密钥
        (window as any)._AMapSecurityConfig = {
          securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECRET || "",
        };

        // 动态导入 AMapLoader，确保只在客户端执行
        const AMapLoader = (await import("@amap/amap-jsapi-loader")).default;

        // 加载高德地图 JS API
        const AMap = await AMapLoader.load({
          key: process.env.NEXT_PUBLIC_AMAP_KEY || "",
          version: "2.0",
          plugins: [
            "AMap.Scale",
            "AMap.ToolBar",
            "AMap.Marker",
            "AMap.Polyline",
          ],
        });

        // 创建地图实例
        const mapInstance = new AMap.Map(mapRef.current, {
          zoom: options.zoom || 10,
          center: options.center || [116.397428, 39.90923], // 默认北京
          pitch: options.pitch || 0,
          viewMode: "3D",
        });

        // 添加控件
        mapInstance.addControl(new AMap.Scale());
        mapInstance.addControl(new AMap.ToolBar());

        setMap(mapInstance);
        setIsLoading(false);
      } catch (err) {
        console.error("地图加载失败:", err);
        setError(err instanceof Error ? err : new Error("地图加载失败"));
        setIsLoading(false);
      }
    };

    initMap();

    // 清理函数
    return () => {
      if (map) {
        map.destroy();
      }
    };
  }, []); // 只在组件挂载时执行一次

  // 添加或更新标记
  const updateMarkers = async (markers: MapMarker[]) => {
    if (!map) return;

    try {
      // 清除所有现有标记
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];

      // 设置安全密钥
      (window as any)._AMapSecurityConfig = {
        securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECRET || "",
      };

      // 动态导入 AMapLoader
      const AMapLoader = (await import("@amap/amap-jsapi-loader")).default;
      const AMap = await AMapLoader.load({
        key: process.env.NEXT_PUBLIC_AMAP_KEY || "",
        version: "2.0",
        plugins: ["AMap.Marker"],
      });

      // 添加新标记
      const newMarkers = markers.map((markerData) => {
        const marker = new AMap.Marker({
          position: markerData.position,
          label: {
            content: `<div style="background-color: ${markerData.color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">${markerData.label}</div>`,
            offset: new AMap.Pixel(0, -30),
          },
          icon: new AMap.Icon({
            size: new AMap.Size(25, 34),
            image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
              <svg xmlns="http://www.w3.org/2000/svg" width="25" height="34" viewBox="0 0 25 34">
                <path fill="${markerData.color}" d="M12.5,0 C5.6,0 0,5.6 0,12.5 C0,21.9 12.5,34 12.5,34 C12.5,34 25,21.9 25,12.5 C25,5.6 19.4,0 12.5,0 Z"/>
                <circle fill="white" cx="12.5" cy="12.5" r="5"/>
              </svg>
            `)}`,
            imageSize: new AMap.Size(25, 34),
          }),
        });
        marker.setMap(map);
        return marker;
      });

      markersRef.current = newMarkers;

      // 如果有标记，自动调整地图视野以包含所有标记
      if (markers.length > 0) {
        map.setFitView(newMarkers);
      }
    } catch (err) {
      console.error("标记更新失败:", err);
    }
  };

  return { mapRef, map, isLoading, error, updateMarkers };
}
