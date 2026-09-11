"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Minus, Plus } from "lucide-react";
import { useAMap, type MapMarker } from "@/hooks/useAMap";
import { usePlaces } from "@/context/places-context";
import { useRoutes } from "@/context/routes-context";
import {
  gapKey,
  routeKey,
  routeModeOf,
  routePointOf,
  type RouteMode,
  type RoutePoint,
} from "@/lib/place-route";
import { placeKindOf } from "@/lib/place-kinds";
import { dayLayerKey, listLayerKey } from "@/types/place";
import { saveHiddenLayers } from "@/actions/trips";
import { Button } from "@/components/ui/button";
import MapLayerSelector from "./MapLayerSelector";
import PlaceDetailCard from "./PlaceDetailCard";

interface MapViewProps {
  /** 行程目的地的中心坐标 [lng, lat]（初始视野；无地点时显示） */
  destinationCenter?: [number, number];
  /** 首屏读到的"被关掉的图层"（trips.hidden_layers），之后由本组件自己维护并回写 */
  hiddenLayers: string[];
}

/** 已访问 marker 的固定灰色 */
const VISITED_SLATE = "#94a3b8";

/**
 * 地图列：每份地点实例一个 marker。
 * 视野策略（用户确认）：
 *  - 进入行程时若有可见 marker → 一次框选能看见全部；没有则停在目的地中心。
 *  - 点击/新增地点：该点已在上半屏可见 → 只放大强调，不重新聚焦；
 *    不在（含被详情卡挡住的下半屏）→ 重新框选到能看见。
 *  - 开关图层（图层选择器勾选变化）→ 重新全量框选当前可见的全部 marker。
 * 所有聚焦（框选 / 缩放至此地点）都把目标压在地图上半屏 ——
 * PlaceDetailCard 悬浮在底部占掉下半屏，居中就等于把目标送进卡里。
 */
export default function MapView({
  destinationCenter,
  hiddenLayers: initialHiddenLayers,
}: MapViewProps) {
  const {
    tripId,
    items,
    placeLists,
    days,
    selectedItemId,
    focusNonce,
    selectItem,
    item,
    itemNumber,
    itemColor,
    dayItemsByDate,
  } = usePlaces();

  const { defaultMode, showRoutes, setShowRoutes, plans, ensurePlan, hiddenGaps } =
    useRoutes();

  const {
    mapRef,
    map,
    isLoading,
    error,
    updateMarkers,
    fitAll,
    fitPath,
    setRoutePaths,
    zoomToPlace,
    isPointVisible,
  } = useAMap({
    zoom: 12,
    center: destinationCenter ?? [116.397428, 39.90923],
  });

  // 图层选择器状态。唯一真相是"**被关掉**的图层键"（l:<id> / d:<date>，见 types/place）：
  // 没记在里面就是可见 —— 所以新建的列表、新增的一天天然是打开的，不需要额外同步一份
  // "已勾选"的集合。（原来那两份"已选中"的 state 就是这么删掉的。）
  // 这份清单要落库（trips.hidden_layers）；"画不画线"那个总开关则只在内存。
  const [showLayerSelector, setShowLayerSelector] = useState(false);
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(
    () => new Set(initialHiddenLayers),
  );

  // 当前可见的图层（画 marker、画路线都按它筛）
  const visibleListIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of placeLists) {
      if (!hiddenLayers.has(listLayerKey(l.id))) s.add(l.id);
    }
    return s;
  }, [placeLists, hiddenLayers]);

  const visibleDayDates = useMemo(() => {
    const s = new Set<string>();
    for (const d of days) {
      if (!hiddenLayers.has(dayLayerKey(d.dayDate))) s.add(d.dayDate);
    }
    return s;
  }, [days, hiddenLayers]);

  // 是否已做过"进入行程"那一次框选（只在首次有可见 marker 时框一次）
  const didEntryFitRef = useRef(false);
  // 最近应用过的可见图层组合，用于识别"开关图层"
  const lastLayerKeyRef = useRef<string | null>(null);

  /** 改图层可见性：本地先生效，再回写库。落库失败不拦着这一屏（纯视图偏好） */
  const applyHiddenLayers = (next: Set<string>) => {
    setHiddenLayers(next);
    saveHiddenLayers(tripId, [...next]).catch((err) =>
      console.warn("图层可见性保存失败:", err),
    );
  };

  const toggleLayer = (key: string) => {
    const next = new Set(hiddenLayers);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    applyHiddenLayers(next);
  };

  const handleToggleList = (listId: string) => toggleLayer(listLayerKey(listId));
  const handleToggleDay = (dayDate: string) => toggleLayer(dayLayerKey(dayDate));

  const handleSelectAll = () => applyHiddenLayers(new Set());

  const handleDeselectAll = () =>
    applyHiddenLayers(
      new Set([
        ...placeLists.map((l) => listLayerKey(l.id)),
        ...days.map((d) => dayLayerKey(d.dayDate)),
      ]),
    );

  // 每份实例一个 marker：编号 = 所在容器内序号；同坐标多份自然重叠。
  // map 就绪后才真正画（依赖 map）。
  // 视野策略：
  //  - 首次可见 marker → 框选一次能看见全部；
  //  - 之后图层勾选组合变化（开关图层）→ 重新全量框选当前可见 marker；
  //  - 仅 items/选中变化（增删、勾选已访问、切 marker）→ 只重建 marker 不框选，
  //    选中地点的条件聚焦走下面独立的 focusNonce effect。
  useEffect(() => {
    if (!map || !updateMarkers) return;

    const markers: MapMarker[] = [];
    for (const it of items) {
      if (it.lng == null || it.lat == null) continue; // 无坐标不画
      const visible = it.listId
        ? visibleListIds.has(it.listId)
        : it.dayDate
          ? visibleDayDates.has(it.dayDate)
          : false;
      if (!visible) continue;
      markers.push({
        id: it.id,
        position: [it.lng, it.lat],
        label: String(itemNumber(it)),
        color: it.visited ? VISITED_SLATE : itemColor(it),
        // 机场/酒店自动挂的实例：地图上也用来源图标（淡蓝飞机 / 淡紫房子），不画序号
        kind: placeKindOf(it),
        visited: it.visited,
        emphasized: it.id === selectedItemId,
        onClick: () => selectItem(it.id),
      });
    }
    updateMarkers(markers);

    // 判断"开关图层"：本次可见的图层组合是否与上次不同（首次也算变化，
    // 但首次框选由 didEntryFitRef 单独控制，这里只负责之后的图层开关重框选）
    const layerKey =
      [...visibleListIds].sort().join(",") +
      "|" +
      [...visibleDayDates].sort().join(",");
    const layerChanged = layerKey !== lastLayerKeyRef.current;
    lastLayerKeyRef.current = layerKey;

    // fitAll 走坐标计算再 setZoomAndCenter，不触碰 marker，避免 onload 竞态
    if (!didEntryFitRef.current) {
      // 进入行程：只在第一次把视野框到能看见全部（没有则停在目的地中心）
      didEntryFitRef.current = true;
      if (markers.length > 0) fitAll();
    } else if (layerChanged && markers.length > 0) {
      // 开关图层：重新框选到当前可见的全部 marker（全关时由下方 effect 回目的地中心）
      fitAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, visibleListIds, visibleDayDates, selectedItemId, map]);

  // 选中/新增地点：已经落在"看得见"的上半屏 → 不聚焦（emphasized 放大即可）；
  // 否则重新框选（fitAll 会把整体压到上半屏）。
  // 注意这里用的是上半屏判据而不是 map.getBounds()：落在下半屏的点虽然也在视野里，
  // 实际被 PlaceDetailCard 挡着，按 bounds 算会被误判成"可见"而不去聚焦。
  // focusNonce 只保证在重新选中时也判断一次。
  useEffect(() => {
    if (!map || !selectedItemId) return;
    const it = item(selectedItemId);
    if (!it || it.lng == null || it.lat == null) return;

    if (!isPointVisible([it.lng, it.lat])) fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId, focusNonce, map]);

  /**
   * 需要画线的间隔 = 当前"打开"的每个 Day 图层里，相邻两张有坐标的卡。
   *
   * 关键：这份列表是从**当前实际的卡片**推出来的，所以卡片删了 / 被拖到别的天 /
   * 图层被关掉，对应的线自然就没了 —— 不需要额外去清理什么"已画路线"的状态。
   * 单独被「隐藏路线」藏起来的间隔在这里就排除掉（但它的信息行还在）。
   *
   * 交通方式从**起点卡**上读（routeModeOf），和行程列那一行读的是同一个字段，
   * 所以两边永远算的是同一条路线，不会一个看驾车一个画步行。
   */
  const routeGaps = useMemo(() => {
    const out: {
      key: string;
      from: RoutePoint;
      to: RoutePoint;
      mode: RouteMode;
      color: string;
    }[] = [];
    for (const day of days) {
      if (!visibleDayDates.has(day.dayDate)) continue; // 只画打开的图层
      const list = dayItemsByDate(day.dayDate);
      for (let i = 0; i + 1 < list.length; i++) {
        const from = routePointOf(list[i]);
        const to = routePointOf(list[i + 1]);
        if (!from || !to) continue; // 没坐标算不了
        const gap = gapKey(list[i].id, list[i + 1].id);
        if (hiddenGaps.has(gap)) continue;
        const mode = routeModeOf(list[i], defaultMode);
        // 线的颜色跟着"这段路所在图层的颜色"走，也就是卡片序号徽标 / 地图 marker 那个色，
        // 同一段的两端同属一天所以必然是同一个色。
        out.push({
          key: routeKey(from, to, mode),
          from,
          to,
          mode,
          color: itemColor(list[i]),
        });
      }
    }
    return out;
  }, [
    days,
    visibleDayDates,
    dayItemsByDate,
    hiddenGaps,
    defaultMode,
    itemColor,
  ]);

  // 总开关打开时把可见图层的线都要来（幂等：间隔那边查过、或库里缓存里有，就直接命中）。
  // 这也是唯一会"一批查很多条"的地方 —— 用户明确点了「显示路线」才发生。
  useEffect(() => {
    if (!showRoutes) return;
    for (const gap of routeGaps) {
      ensurePlan(gap.key, gap.from, gap.to, gap.mode);
    }
  }, [showRoutes, routeGaps, ensurePlan]);

  // 数据齐了的线（没方案 / 还没查完的先不算）
  const drawableLines = useMemo(
    () =>
      showRoutes
        ? routeGaps.flatMap((g) => {
            const state = plans[g.key];
            return state?.status === "ready" && state.plan.path.length >= 2
              ? [{ key: g.key, path: state.plan.path, color: g.color }]
              : [];
          })
        : [],
    [showRoutes, routeGaps, plans],
  );

  // 画线/清线的签名（画上去了哪几条）。plans 是整张缓存表，别的间隔陆续查完
  // 也会让下面这个 effect 重跑 —— 靠它挡掉重画，不然会把视野一次次拉回去。
  const drawnSigRef = useRef("");
  const fitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map) return;
    // 签名带上颜色：图层配色变了也要重画
    const sig = drawableLines.map((l) => `${l.key}@${l.color}`).join("|");
    if (sig === drawnSigRef.current) return;
    drawnSigRef.current = sig;

    setRoutePaths(drawableLines.map((l) => ({ path: l.path, color: l.color })));
    if (drawableLines.length === 0) return;

    // 一批查询是陆续回来的，签名会连续变好几次；攒一下再框选，
    // 否则视野会随着每条线到达被反复重置（拖开地图时很烦）。
    if (fitTimerRef.current) window.clearTimeout(fitTimerRef.current);
    const paths = drawableLines.map((l) => l.path);
    fitTimerRef.current = window.setTimeout(() => {
      fitTimerRef.current = null;
      fitPath(paths);
    }, 150);
  }, [map, drawableLines, setRoutePaths, fitPath]);

  // 卸载时清掉没跑完的框选计时器
  useEffect(
    () => () => {
      if (fitTimerRef.current) window.clearTimeout(fitTimerRef.current);
    },
    [],
  );

  // 没有任何可见 marker 时，回到目的地中心
  const hasAnyVisible = useMemo(
    () =>
      items.some((it) => {
        if (it.lng == null || it.lat == null) return false;
        return it.listId
          ? visibleListIds.has(it.listId)
          : it.dayDate
            ? visibleDayDates.has(it.dayDate)
            : false;
      }),
    [items, visibleListIds, visibleDayDates]
  );

  useEffect(() => {
    if (map && destinationCenter && !hasAnyVisible) {
      map.setCenter(destinationCenter);
    }
  }, [map, destinationCenter, hasAnyVisible]);

  return (
    <div className="absolute inset-0 bg-gray-100">
      {/* 地图容器 */}
      <div ref={mapRef} className="w-full h-full" />

      {/* 缩放 +/-（替代 AMap.ToolBar：原控件会触发 Pixel(NaN,NaN) 异常风暴） */}
      {map && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-20">
          <Button
            variant="secondary"
            size="icon"
            className="h-9 w-9 rounded-lg shadow-lg bg-white hover:bg-gray-50"
            aria-label="放大地图"
            title="放大"
            onClick={() => map.zoomIn?.()}
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-9 w-9 rounded-lg shadow-lg bg-white hover:bg-gray-50"
            aria-label="缩小地图"
            title="缩小"
            onClick={() => map.zoomOut?.()}
          >
            <Minus className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* 图层选择器按钮 */}
      <Button
        variant="secondary"
        size="icon"
        className="absolute top-4 right-4 h-10 w-10 rounded-lg shadow-lg z-20 bg-white hover:bg-gray-50"
        onClick={() => setShowLayerSelector(!showLayerSelector)}
        title="地图图层"
      >
        <Layers className="h-5 w-5" />
      </Button>

      {/* 图层选择器面板 */}
      <MapLayerSelector
        open={showLayerSelector}
        onClose={() => setShowLayerSelector(false)}
        lists={placeLists}
        days={days}
        selectedListIds={visibleListIds}
        selectedDayDates={visibleDayDates}
        onToggleList={handleToggleList}
        onToggleDay={handleToggleDay}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        showRoutes={showRoutes}
        onToggleRoutes={() => setShowRoutes((v) => !v)}
      />

      {/* 底部悬浮：地点详情卡（含导航/缩放工具条） */}
      <PlaceDetailCard zoomToPlace={zoomToPlace} />

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
