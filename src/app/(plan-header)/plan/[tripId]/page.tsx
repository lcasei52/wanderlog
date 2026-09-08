import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { trips } from "@/db/schema";
import type { TripSummary } from "@/types/trip";
import SimpleSidebar from "../components/SimpleSidebar";
import DetailContent from "../components/DetailContent";
import MapView from "../components/MapView";

// 把 DB 行转成可传给客户端组件的快照
function toTripSummary(row: (typeof trips.$inferSelect)): TripSummary {
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
  };
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  const result = await getDb()
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);

  if (result.length === 0) {
    notFound();
  }

  const trip = toTripSummary(result[0]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <SimpleSidebar key={`${trip.id}-sidebar`} trip={trip} />
      <DetailContent key={trip.id} trip={trip} />
      <MapView destinationCenter={trip.destination?.location ? [trip.destination.location.lng, trip.destination.location.lat] : undefined} />
    </div>
  );
}
