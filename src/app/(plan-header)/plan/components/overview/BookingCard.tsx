"use client";

import { Plane, Hotel, Car, Train, Paperclip, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BookingCardProps {
  flightCount?: number;
  hotelCount?: number;
  onItemClick?: (variant: "flights" | "hotels") => void;
}

export default function BookingCard({
  flightCount = 0,
  hotelCount = 0,
  onItemClick,
}: BookingCardProps) {
  const bookingItems = [
    { icon: Plane, label: "航班", count: flightCount, variant: "flights" as const },
    { icon: Hotel, label: "住宿", count: hotelCount, variant: "hotels" as const },
    { icon: Car, label: "租车", count: 0 },
    { icon: Train, label: "火车", count: 0 },
    { icon: Paperclip, label: "附件", count: 0, hasNotification: true },
    { icon: MoreHorizontal, label: "其他", count: 0 },
  ];

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">预订和附件</h3>
      <div className="flex items-center justify-between">
        {bookingItems.map((item) => (
          <Button
            key={item.label}
            variant="ghost"
            className="flex flex-col items-center gap-2 h-auto p-2 hover:opacity-70"
            onClick={() => {
              if (item.variant && onItemClick) {
                onItemClick(item.variant);
              }
            }}
          >
            <div className="relative">
              <item.icon className="h-6 w-6 text-gray-700" />
              {item.hasNotification && (
                <div className="absolute -top-1 -right-1 h-2 w-2 bg-orange-500 rounded-full" />
              )}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-gray-600">{item.label}</span>
              {item.count > 0 && (
                <span className="text-xs font-semibold text-gray-900">{item.count}</span>
              )}
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
