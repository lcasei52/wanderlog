import SimpleSidebar from "../components/SimpleSidebar";
import DetailContent from "../components/DetailContent";
import MapView from "../components/MapView";

export default function TripDetailPage({
  params,
}: {
  params: { tripId: string };
}) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <SimpleSidebar />
      <DetailContent />
      <MapView />
    </div>
  );
}
