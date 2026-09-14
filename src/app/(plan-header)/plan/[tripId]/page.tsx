import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  trips,
  flights,
  hotels,
  lists,
  placeItems,
  notes,
  type Flight,
  type Hotel,
  type List,
  type PlaceItem,
  type Note,
} from "@/db/schema";
import { ensureTripPlaceLists } from "@/db/trip-place-lists";
import { loadRoutePlans } from "@/db/route-plans";
import type { CachedRoutePlan } from "@/lib/place-route";
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

/**
 * 首屏这一次 trip 查询。
 * 用 cache() 包起来是因为 generateMetadata 也要行程名 —— 不包的话一次页面加载
 * 会往 Neon 打两次同样的查询，而每多一次查询就多一趟到 Neon 的往返
 * （neon-http 每次查询一个 HTTP 请求，开销在往返本身，见 db/client.ts）。
 * cache() 只在这一个请求内去重，不跨请求，不会拿到旧数据。
 */
const getTripRow = cache(async (tripId: string) => {
  const db = getDb();
  const rows = await db
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
    .limit(1);
  return rows[0] ?? null;
});

// 标签页标题：图案（src/app/icon.svg）+ 行程名
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tripId: string }>;
}): Promise<Metadata> {
  const { tripId } = await params;
  const row = await getTripRow(tripId);
  return { title: row?.name ?? "行程" };
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  const db = getDb();

  /*
   * 首屏这几张表一次并发读完。
   * 以前是 6 次串行，注释给的理由是"避免并发连接限制（只允许 1 个连接）"——
   * 那个理由不成立（见 db/client.ts）：neon-http 每次查询就是一个独立的 HTTPS
   * 请求，没有连接可占。串行的代价是延迟按查询数**相加**，并发则是**取最大**，
   * 本机到 Neon 一趟往返要一两秒，这一项就是十几秒的差别。
   *
   * 顺序上只有一个约束：这批读完成后，才轮到 ensureTripPlaceLists 那个写。
   */
  const [row, flightRows, hotelRows, itemRows, noteRows, fetchedListRows] =
    await Promise.all([
      getTripRow(tripId),
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
      db
        .select()
        .from(placeItems)
        .where(eq(placeItems.tripId, tripId))
        .orderBy(asc(placeItems.createdAt)),
      db
        .select()
        .from(notes)
        .where(eq(notes.tripId, tripId))
        .orderBy(asc(notes.position), asc(notes.createdAt)),
      db
        .select()
        .from(lists)
        .where(eq(lists.tripId, tripId))
        .orderBy(asc(lists.position)),
    ]);

  if (!row) {
    notFound();
  }

  const trip = toTripSummary(row);

  /*
   * 保证至少有一个默认地点列表（兼容已建行程）。
   * 上面那批已经把 lists 读回来了，通常直接用它判断就够 —— ensureTripPlaceLists
   * 内部查的是同一张表，再调一次等于白跑一趟往返。只有列表真的为空时才走那条路。
   */
  let listRows = fetchedListRows;
  if (listRows.length === 0) {
    await ensureTripPlaceLists(tripId);
    listRows = await db
      .select()
      .from(lists)
      .where(eq(lists.tripId, tripId))
      .orderBy(asc(lists.position));
  }

  // 已查过的路线（时长/距离/折线）跟着首屏一起下来，前端就不必再问一次高德
  // 临时注释：Neon 查询超时，先让页面能打开（路线会在前端重新查高德）
  const routePlanRows: CachedRoutePlan[] = []; // await loadRoutePlans(tripId);

  return (
    <TripWorkspace
      key={trip.id} // 跨行程切换时重挂 PlacesProvider，避免残留上一行程的内存态
      trip={trip}
      flights={flightRows as Flight[]}
      hotels={hotelRows as Hotel[]}
      placeItems={itemRows as PlaceItem[]}
      placeLists={listRows as List[]}
      notes={noteRows as Note[]}
      routePlans={routePlanRows}
      hiddenLayers={row.hiddenLayers}
      destinationCenter={
        trip.destination?.location
          ? [trip.destination.location.lng, trip.destination.location.lat]
          : undefined
      }
    />
  );
}
