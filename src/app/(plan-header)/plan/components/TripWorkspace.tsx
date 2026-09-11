"use client";

import { useState } from "react";
import type { TripSummary } from "@/types/trip";
import type { Flight, Hotel, List, PlaceItem } from "@/db/schema";
import type { CachedRoutePlan } from "@/lib/place-route";
import { PlacesProvider } from "@/context/places-context";
import { BookingsProvider } from "@/context/bookings-context";
import { RoutesProvider } from "@/context/routes-context";
import SimpleSidebar from "./SimpleSidebar";
import DetailContent from "./DetailContent";
import MapView from "./MapView";

interface TripWorkspaceProps {
  /** 来自服务端 page 的可序列化行程快照 */
  trip: TripSummary;
  /** 该行程已入库的航班 / 住宿（BookingsProvider 初值） */
  flights: Flight[];
  hotels: Hotel[];
  /** 该行程已入库的地点实例 / 地点列表（PlacesProvider 初值） */
  placeItems: PlaceItem[];
  placeLists: List[];
  /** 已入库的路线缓存（route_plans），灌进 RoutesProvider 省掉重复查询 */
  routePlans: CachedRoutePlan[];
  /** 地图图层里被关掉的那些（trips.hidden_layers），地图列每次改动都会回写 */
  hiddenLayers: string[];
  /** 行程目的地的中心坐标 [lng, lat]（无则不给） */
  destinationCenter?: [number, number];
}

/**
 * 详情页三列布局的 client 边界：把 SimpleSidebar / DetailContent / MapView
 * 都包进 PlacesProvider + BookingsProvider，让地点实例/成员/选中态与
 * 航班/住宿增删、展开态共享。地图列用 relative 壳包住 MapView 和浮在上面的 PlaceDetailCard。
 */
export default function TripWorkspace({
  trip,
  flights,
  hotels,
  placeItems,
  placeLists,
  routePlans,
  hiddenLayers,
  destinationCenter,
}: TripWorkspaceProps) {
  // 详情页滚动到哪 → 侧边栏高亮到哪（scrollspy）
  const [active, setActive] = useState<{
    section: string | null;
    subId: string | null;
  }>({ section: "overview", subId: null });

  return (
    <PlacesProvider
      tripId={trip.id}
      tripDates={{ startDate: trip.startDate, endDate: trip.endDate }}
      seeds={{ items: placeItems, placeLists }}
    >
      <BookingsProvider tripId={trip.id} flights={flights} hotels={hotels}>
        {/* 路线缓存/隐藏态/地图画线开关由行程列（间隔那行）与地图列（那些线）共享。
            城市只给公交查询用（高德的公交必须有城市），拿行程目的地顶上；
            库里已有的路线（routePlans）作为初值灌进去，重开行程就不用再问高德了。 */}
        <RoutesProvider
          tripId={trip.id}
          initialPlans={routePlans}
          city={trip.destination?.name ?? null}
        >
          <div className="flex flex-1 overflow-hidden">
            <SimpleSidebar
              trip={trip}
              activeSection={active.section}
              activeSubId={active.subId}
            />
            <DetailContent trip={trip} onActiveChange={setActive} />

            {/* 地图列：MapView 铺满（PlaceDetailCard 已嵌在 MapView 内、悬浮于地图底部） */}
            <div className="relative flex-1 min-w-0">
              <MapView
                destinationCenter={destinationCenter}
                hiddenLayers={hiddenLayers}
              />
            </div>
          </div>
        </RoutesProvider>
      </BookingsProvider>
    </PlacesProvider>
  );
}
