"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTO_PLACE_COLORS,
  AUTO_PLACE_ICON_PATHS,
  type AutoPlaceKind,
  type PlaceKind,
} from "@/lib/place-kinds";

interface UseAMapOptions {
  zoom?: number;
  center?: [number, number];
  pitch?: number;
}

/* ------------------------------------------------------------
 * 视野计算：一律只用自算的 Web Mercator 投影，不依赖 AMap 辅助类
 * （JSAPI v2 运行时没有 LngLatBounds；setFitView/ToolBar 会触发 Pixel(NaN) 风暴）。
 * ------------------------------------------------------------ */
const TILE = 256; // 标准 web tile 尺寸：世界 = 256 * 2^zoom px
/** 下半屏被 PlaceDetailCard 盖住，聚焦一律把目标压进上面这 45% 里 */
const FOCUS_BAND_RATIO = 0.45;
const FOCUS_TOP_PAD = 40; // 顶部给缩放按钮留空
const FOCUS_SIDE_PAD = 40;
/** 单点聚焦时目标停在容器 30% 高度处（上方还留着 marker 图标与编号 chip 的位置） */
const POINT_ANCHOR_Y = 0.3;

/** ZOOM 下纬度 → 世界像素 y（北半球越小） */
function latToWorldY(lat: number, zoom: number): number {
  const k = TILE * Math.pow(2, zoom);
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) / 2) * k;
}

/** ZOOM 下世界像素 y → 纬度（上式反函数；n 归一化到 0~1 时不会超过 ±85.05°） */
function worldYToLat(y: number, zoom: number): number {
  const k = TILE * Math.pow(2, zoom);
  const n = y / k;
  return ((2 * Math.atan(Math.exp(Math.PI * (1 - 2 * n))) - Math.PI / 2) * 180) / Math.PI;
}

/**
 * 让某纬度出现在容器高度 anchorY（0=顶部，1=底部）处所需的"视野中心纬度"。
 * 容器 y 与世界 y 只差一个平移，所以目标点想出现在中点以上，
 * 视野中心就得放到它下面 —— 差值就是 (0.5 - anchorY) × 容器高度。
 */
function centerLatForAnchor(
  lat: number,
  zoom: number,
  height: number,
  anchorY: number,
): number {
  const k = TILE * Math.pow(2, zoom);
  const y = latToWorldY(lat, zoom) + (0.5 - anchorY) * height;
  return worldYToLat(Math.min(Math.max(y, 0), k), zoom);
}

export interface MapMarker {
  id: string;
  position: [number, number]; // [lng, lat]
  label: string; // marker 编号文字
  color: string; // teardrop / chip 主色
  /** 视觉种类：手动地点=编号；机场(flight)/酒店(hotel)=淡色底 + 同色图标，不带数字 */
  kind?: PlaceKind;
  visited?: boolean; // 已访问 → 灰色 + 圆圈内打勾
  emphasized?: boolean; // 选中 → 更高 z-index + 强调 chip
  onClick?: () => void;
}

/**
 * 机场/酒店 marker 的内芯：白色线描图标画在实色底上。
 * lucide 是 24×24，缩到 ~15px 再居中到 teardrop 圆头的中心 (12.5, 12)。
 */
function autoPlaceIconSvg(kind: AutoPlaceKind, fg: string): string {
  const paths = AUTO_PLACE_ICON_PATHS[kind]
    .map((d) => `<path d="${d}"/>`)
    .join("");
  const scale = 0.62;
  const offset = 12.5 - 12 * scale;
  return `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${fg}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
}

/**
 * 生成一个 marker 的 teardrop icon。
 * 统一白色边框；手动地点=实色底+白色序号；flight/hotel=实色底+白色图标。
 * emphasized = 选中放大（1.35x），viewBox 固定缩放，内部图形随之放大。
 */
function teardropIcon(amap: any, marker: MapMarker): any {
  const k = marker.emphasized ? 1.35 : 1;
  const auto = marker.kind === "flight" || marker.kind === "hotel";
  const { bg, fg } = auto
    ? AUTO_PLACE_COLORS[marker.kind as AutoPlaceKind]
    : { bg: marker.color, fg: "" };

  let innerContent: string;
  if (auto) {
    innerContent = autoPlaceIconSvg(marker.kind as AutoPlaceKind, fg);
  } else if (marker.visited) {
    innerContent = `<path d="M9 12.5l2.5 2.5 4.5-5" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else {
    innerContent = `<text x="12.5" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="700">${marker.label}</text>`;
  }

  const shadow = marker.emphasized
    ? `<filter id="s"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="0.3"/></filter>`
    : "";
  const filterAttr = marker.emphasized ? ' filter="url(#s)"' : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${25 * k}" height="${34 * k}" viewBox="0 0 25 34">
    ${shadow ? `<defs>${shadow}</defs>` : ""}
    <path${filterAttr} fill="${bg}" stroke="white" stroke-width="2" d="M12.5,1 C6.15,1 1,6.15 1,12.5 C1,21.4 12.5,33 12.5,33 C12.5,33 24,21.4 24,12.5 C24,6.15 18.85,1 12.5,1 Z"/>
    ${innerContent}
  </svg>`;
  return new amap.Icon({
    size: new amap.Size(25 * k, 34 * k),
    image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    imageSize: new amap.Size(25 * k, 34 * k),
    anchor: new amap.Pixel(12.5 * k, 34 * k),
  });
}

/** 生成 marker 顶部的编号 chip（emphasized 时加大 + 阴影，visited 变灰） */
function labelContent(color: string, text: string, emphasized?: boolean): string {
  const pad = emphasized ? "3px 10px" : "2px 8px";
  const fontSize = emphasized ? "13px" : "12px";
  const shadow = emphasized
    ? "box-shadow: 0 2px 8px rgba(0,0,0,0.25);"
    : "box-shadow: 0 1px 3px rgba(0,0,0,0.15);";
  return `<div style="background-color: ${color}; color: white; padding: ${pad}; border-radius: 999px; font-size: ${fontSize}; font-weight: 700; line-height: 1; border: 2px solid white; ${shadow}">${text}</div>`;
}

export function useAMap(options: UseAMapOptions = {}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const amapNsRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, { inst: any; fp: string }>>(new Map());
  // 当前画在地图上的路线折线（同一时刻最多一条，换模式/隐藏时整条替换）
  const routeRef = useRef<any[]>([]);
  // 保留 map 的 React state：仅供消费方判断"地图已就绪"（其余操作走 ref，避免闭包过期）
  const [map, setMap] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    let cancelled = false;

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
          plugins: ["AMap.Scale", "AMap.ToolBar", "AMap.Marker"],
        });

        if (cancelled || !mapRef.current) return;
        amapNsRef.current = AMap;

        // 创建地图实例（先不对外暴露：此时投影可能尚未就绪，过早建 marker/控件
        // 会让 AMap 在图片 onload 重排时用未初始化的投影计算 → Pixel(NaN,NaN) 报错串）
        const mapInstance = new AMap.Map(mapRef.current, {
          zoom: options.zoom || 10,
          center: options.center || [116.397428, 39.90923],
          pitch: options.pitch || 0,
          viewMode: "2D",
          animateEnable: true,
          jogEnable: false,
        });
        mapInstanceRef.current = mapInstance;

        let controlsAdded = false;
        let ready = false;
        const finalize = () => {
          if (cancelled || ready) return;
          ready = true;
          if (!controlsAdded) {
            controlsAdded = true;
            // 注意：不要加 AMap.ToolBar —— 它会带来一连串 "Invalid Object: Pixel(NaN, NaN)"
            // 未捕获异常（其内部图片 onload 会用未就绪的投影做 lngLatToContainer）。
            // 缩放按钮由 MapView 自行叠两个 +/- 代替（见 MapView）。
            mapInstance.addControl(new AMap.Scale());
          }
          setMap(mapInstance);
          setIsLoading(false);
        };
        // 首帧渲染完成（投影可用）后再挂控件并把 map 交给 React；兜底计时防止事件缺失卡死
        mapInstance.on("complete", finalize);
        setTimeout(finalize, 1500);
      } catch (err) {
        console.error("地图加载失败:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("地图加载失败"));
          setIsLoading(false);
        }
      }
    };

    initMap();

    // 清理函数
    return () => {
      cancelled = true;
      for (const { inst } of markersRef.current.values()) inst.setMap(null);
      markersRef.current = new Map();
      routeRef.current.forEach((line) => line.setMap(null));
      routeRef.current = [];
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次（options 由调用方保证首帧即定）

  /** 增量更新 markers：只增删/替换发生变化的，不全量重建 */
  const updateMarkers = useCallback((markers: MapMarker[]) => {
    const AMap = amapNsRef.current;
    const mapInstance = mapInstanceRef.current;
    if (!AMap || !mapInstance) return;

    const prev = markersRef.current;
    const next = new Map<string, { inst: any; fp: string }>();
    const incomingIds = new Set<string>();

    for (const m of markers) {
      incomingIds.add(m.id);
      const fp = `${m.position[0]},${m.position[1]}|${m.label}|${m.color}|${m.kind ?? ""}|${m.visited ? 1 : 0}|${m.emphasized ? 1 : 0}`;
      const existing = prev.get(m.id);

      if (existing && existing.fp === fp) {
        next.set(m.id, existing);
        continue;
      }

      // 需要新建或替换
      if (existing) existing.inst.setMap(null);
      const inst = new AMap.Marker({
        position: m.position,
        icon: teardropIcon(AMap, m),
      });
      inst.setzIndex(m.emphasized ? 1000 : 0);
      inst.on("click", () => m.onClick?.());
      inst.setMap(mapInstance);
      next.set(m.id, { inst, fp });
    }

    // 删除不再存在的 marker
    for (const [id, entry] of prev) {
      if (!incomingIds.has(id)) entry.inst.setMap(null);
    }

    markersRef.current = next;
  }, []);

  /**
   * 聚焦到某点：把它放在容器 30% 高度处（上半屏）。
   * 底部悬浮的 PlaceDetailCard 盖着下半屏，居中就等于把目标送进卡里。
   */
  const focusOnPoint = useCallback(
    (position: [number, number], zoom: number) => {
      const mapInstance = mapInstanceRef.current;
      if (!mapInstance) return;
      try {
        const size = mapInstance.getSize();
        if (!size) return;
        const centerLat = centerLatForAnchor(
          position[1],
          zoom,
          size.height,
          POINT_ANCHOR_Y,
        );
        // 经度不变（水平居中），只把视野中心往南挪，目标自然落到上面
        mapInstance.setZoomAndCenter(zoom, [position[0], centerLat]);
      } catch (err) {
        console.warn("聚焦失败:", err);
      }
    },
    [],
  );

  /** 平移并缩放到某点（zoom 默认 14，做"聚焦到地点"） */
  const panTo = useCallback(
    (position: [number, number], zoom = 14) => focusOnPoint(position, zoom),
    [focusOnPoint],
  );

  /**
   * 该点是否已经落在"看得见"的区域内（上半屏，且没贴边）。
   * 不能用 map.getBounds() 判断：下半屏的坐标虽然也在视野范围内，
   * 实际被 PlaceDetailCard 挡着，按 bounds 算会误判成"可见"而不去聚焦。
   */
  const isPointVisible = useCallback((position: [number, number]) => {
    const mapInstance = mapInstanceRef.current;
    if (!mapInstance) return false;
    try {
      const size = mapInstance.getSize();
      const zoom = mapInstance.getZoom?.();
      const center = mapInstance.getCenter?.();
      if (!size || typeof zoom !== "number" || !center) return false;
      const k = TILE * Math.pow(2, zoom);
      const x =
        size.width / 2 + ((position[0] - center.getLng()) / 360) * k;
      const y =
        size.height / 2 +
        (latToWorldY(position[1], zoom) - latToWorldY(center.getLat(), zoom));
      // marker 图标画在坐标点上方，顶部多留一点，别让编号 chip 被裁掉
      return (
        x >= 8 &&
        x <= size.width - 8 &&
        y >= 40 &&
        y <= size.height * FOCUS_BAND_RATIO
      );
    } catch {
      return false; // 算不出就当作不可见 → 触发一次聚焦，比不聚焦安全
    }
  }, []);

  /**
   * 视野缩放到能装下当前所有 marker。
   * 注意：不要用 map.setFitView(markers) —— 图标还没加载完时让它去 fit marker
   * 会触发 AMap 内部 onload 重排竞态，抛一连串 "Invalid Object: Pixel(NaN, NaN)"。
   * 也不能用 new AMap.LngLatBounds(...) 再 setBounds：JSAPI v2 运行时没有这个构造器
   * （实测 "LngLatBounds is not a constructor"）。
   * 这里自行用 Web Mercator 投影把各点像素范围算出来，二分出能装下全部点的最高 zoom，
   * 再 setZoomAndCenter —— 只动视野、只调用实例方法，不依赖任何 AMap 辅助类。
   *
   * 位置同样按"上半屏"算：可用区域取上面 45%（下半屏被 PlaceDetailCard 挡住），
   * 并把外接矩形的中心压在这条带子的正中，而不是视野正中。
   */
  const fitPoints = useCallback(
    (points: [number, number][]) => {
      const mapInstance = mapInstanceRef.current;
      if (!mapInstance || points.length === 0) return;
      try {
        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;
        let any = false;
        for (const [lng, lat] of points) {
          if (typeof lng !== "number" || typeof lat !== "number") continue;
          any = true;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        if (!any) return;

        const size = mapInstance.getSize();
        if (!size) return;

        const centerLng = (minLng + maxLng) / 2;
        const centerLat = (minLat + maxLat) / 2;

        // 所有点重合：外接矩形是 0，直接给个固定级别展示周边
        if (minLng === maxLng && minLat === maxLat) {
          focusOnPoint([centerLng, centerLat], 15);
          return;
        }

        // 可用区域 = 上半屏那条带子（下半屏被详情卡占着），四周留边
        const availW = size.width - FOCUS_SIDE_PAD * 2;
        const availH = size.height * FOCUS_BAND_RATIO - FOCUS_TOP_PAD;
        if (availW <= 0 || availH <= 0) return;

        // 某 zoom 下外接矩形占的像素宽高（纬度越北 y 越小，故高度 = 南边 y − 北边 y）
        const pxSpanAt = (z: number) => ({
          w: ((maxLng - minLng) / 360) * TILE * Math.pow(2, z),
          h: latToWorldY(minLat, z) - latToWorldY(maxLat, z),
        });

        // 二分：求能塞进可用区域（宽高同时满足）的最高 zoom
        let lo = 3;
        let hi = 20;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          const { w, h } = pxSpanAt(mid);
          if (w <= availW && h <= availH) lo = mid;
          else hi = mid - 1;
        }
        const zoom = Math.min(lo, 18); // 别贴太近，给交互留余量

        // 把矩形中心对到带子正中（= 容器 25% 高度处），而不是视野正中
        const anchorY = (FOCUS_TOP_PAD + availH / 2) / size.height;
        mapInstance.setZoomAndCenter(zoom, [
          centerLng,
          centerLatForAnchor(centerLat, zoom, size.height, anchorY),
        ]);
      } catch (err) {
        console.warn("框选视野失败:", err);
      }
    },
    [focusOnPoint],
  );

  /** 视野缩放到能装下当前所有 marker（各点坐标从 marker 实例上取） */
  const fitAll = useCallback(() => {
    const points: [number, number][] = [];
    for (const { inst } of markersRef.current.values()) {
      const pos = inst.getPosition?.();
      if (!pos) continue;
      const lng = pos.getLng?.();
      const lat = pos.getLat?.();
      if (typeof lng === "number" && typeof lat === "number") {
        points.push([lng, lat]);
      }
    }
    fitPoints(points);
  }, [fitPoints]);

  /**
   * 在地图上画若干条路线（传空数组就是全部清除）。整组替换，不做增量。
   * 每条线可以各自带 strokeColor —— 行程里按天/列表配色，线要跟 marker 同色。
   *
   * 折线走 AMap 核心的 Polyline，不用 setFitView 框选（见上面注释的 NaN 风暴），
   * 需要框就复用 fitPoints 自己算。
   */
  const setRoutePaths = useCallback(
    (lines: { path: [number, number][]; color?: string }[]) => {
      const AMap = amapNsRef.current;
      const mapInstance = mapInstanceRef.current;
      if (!AMap || !mapInstance) return;

      routeRef.current.forEach((line) => line.setMap(null));
      routeRef.current = [];
      const drawable = lines.filter((l) => l.path.length >= 2);
      if (drawable.length === 0) return;

      const draw = () => {
        try {
          routeRef.current = drawable.map(({ path, color }) => {
            const line = new AMap.Polyline({
              path,
              strokeColor: color ?? "#f97316", // 没给颜色时退回拖放插入线那个橙
              strokeWeight: 5,
              strokeOpacity: 0.9,
              lineJoin: "round",
              lineCap: "round",
              showDir: true,
              zIndex: 60,
            });
            line.setMap(mapInstance);
            return line;
          });
        } catch (err) {
          console.warn("路线绘制失败:", err);
        }
      };

      // 覆盖物在 2.0 属核心，正常直接可用；真缺了就按插件兜底加载一次
      if (AMap.Polyline) draw();
      else AMap.plugin?.(["AMap.Polyline"], draw);
    },
    [],
  );

  /**
   * 把视野框到一组路线上（每条抽稀后合并，折线动辄上千点）。
   * 传 [[点...]] 这样的一组折线；框单选中的全部路线用。
   */
  const fitPath = useCallback(
    (paths: [number, number][][]) => {
      const points: [number, number][] = [];
      for (const path of paths) {
        if (path.length === 0) continue;
        const step = Math.max(1, Math.floor(path.length / 200));
        for (let i = 0; i < path.length; i += step) points.push(path[i]);
        const last = path[path.length - 1];
        if (points[points.length - 1] !== last) points.push(last);
      }
      fitPoints(points);
    },
    [fitPoints],
  );

  /** 缩放到某个地点（PlaceDetailCard 的「缩放至此地点」），同样放上半屏 */
  const zoomToPlace = useCallback(
    (position: [number, number], zoom = 16) => focusOnPoint(position, zoom),
    [focusOnPoint],
  );

  return {
    mapRef,
    map,
    isLoading,
    error,
    updateMarkers,
    panTo,
    fitAll,
    fitPoints,
    fitPath,
    setRoutePaths,
    zoomToPlace,
    isPointVisible,
  };
}
