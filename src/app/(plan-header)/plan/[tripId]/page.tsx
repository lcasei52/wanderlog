import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  trips,
  flights,
  hotels,
  lists,
  placeItems,
  type Flight,
  type Hotel,
  type List,
  type PlaceItem,
} from "@/db/schema";
import { ensureTripPlaceLists } from "@/db/trip-place-lists";
import { loadRoutePlans } from "@/db/route-plans";
import type { TripSummary } from "@/types/trip";
import TripWorkspace from "../components/TripWorkspace";

// 把 DB 行转成可传给客户端组件的快照
function toTripSummary(row: {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  destinationName: string | null;
  destinationLng: number | null;
  destinationLat: number | null;
  destinationType: string | null;
  coverImageUrl: string | null;
  coverImageData: string | null;
}): TripSummary {
  const hasCoords =
    row.destinationName && row.destinationLng != null && row.destinationLat != null;

  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    destination: hasCoords
      ? {
          name: row.destinationName!,
          type: (row.destinationType ?? "city") as "city" | "province" | "country",
          location: { lng: row.destinationLng!, lat: row.destinationLat! },
        }
      : undefined,
    coverImageUrl: row.coverImageUrl,
    coverImageData: row.coverImageData,
  };
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  const db = getDb();
  const [result, flightRows, hotelRows] = await Promise.all([
    db
      .select({
        id: trips.id,
        name: trips.name,
        startDate: trips.startDate,
        endDate: trips.endDate,
        destinationName: trips.destinationName,
        destinationLng: trips.destinationLng,
        destinationLat: trips.destinationLat,
        destinationType: trips.destinationType,
        coverImageUrl: trips.coverImageUrl,
        coverImageData: trips.coverImageData,
        // 地图图层里被关掉的那些（初值，之后由 MapView 自己读写）
        hiddenLayers: trips.hiddenLayers,
      })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1),
    // position 是拖拽排序的落库顺序；旧数据 position 全为 0，靠 createdAt 兜底保持原顺序
    db
      .select()
      .from(flights)
      .where(eq(flights.tripId, tripId))
      .orderBy(asc(flights.position), asc(flights.createdAt)),
    db
      .select()
      .from(hotels)
      .where(eq(hotels.tripId, tripId))
      .orderBy(asc(hotels.position), asc(hotels.createdAt)),
  ]);

  if (result.length === 0) {
    notFound();
  }

  const trip = toTripSummary(result[0]);

  // 保证至少有一个默认地点列表（兼容已建行程），再读 lists / place_items / 路线缓存作为初值
  await ensureTripPlaceLists(tripId);
  const [listRows, itemRows, routePlanRows] = await Promise.all([
    db
      .select()
      .from(lists)
      .where(eq(lists.tripId, tripId))
      .orderBy(asc(lists.position)),
    db
      .select()
      .from(placeItems)
      .where(eq(placeItems.tripId, tripId))
      .orderBy(asc(placeItems.createdAt)),
    // 已查过的路线（时长/距离/折线）跟着首屏一起下来，前端就不必再问一次高德
    loadRoutePlans(tripId),
  ]);

  return (
    <TripWorkspace
      key={trip.id} // 跨行程切换时重挂 PlacesProvider，避免残留上一行程的内存态
      trip={trip}
      flights={flightRows as Flight[]}
      hotels={hotelRows as Hotel[]}
      placeItems={itemRows as PlaceItem[]}
      placeLists={listRows as List[]}
      routePlans={routePlanRows}
      hiddenLayers={result[0].hiddenLayers}
      destinationCenter={
        trip.destination?.location
          ? [trip.destination.location.lng, trip.destination.location.lat]
          : undefined
      }
    />
  );
}
