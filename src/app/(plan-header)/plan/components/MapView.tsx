"use client";

export default function MapView() {
  return (
    <div className="flex-1 bg-gray-100 flex items-center justify-center relative">
      <div className="text-center">
        <p className="text-gray-400 text-lg mb-2">地图区域</p>
        <p className="text-gray-400 text-sm">
          待接入 Google Maps / 高德地图 API
        </p>
      </div>
    </div>
  );
}
