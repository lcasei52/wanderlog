"use client";

import { Plane, Hotel, Car, Train, Paperclip, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookings, type BookingVariant } from "@/context/bookings-context";

/** 滚动到对应 section 并展开（BookingCard 顶部快捷入口） */
export function scrollToSection(variant: BookingVariant): void {
  const element = document.getElementById(`list-${variant}`);
  if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** 预订和附件：航班/住宿计数与展开态都从 BookingsProvider 自取 */
export default function BookingCard() {
  const { flights, hotels, expanded, setExpanded } = useBookings();

  const openSection = (variant: BookingVariant) => {
    setExpanded(variant, true);
    scrollToSection(variant);
  };

  const bookingItems = [
    {
      icon: Plane,
      label: "航班",
      count: flights.length,
      variant: "flights" as const,
      hasDot: flights.length > 0,
    },
    {
      icon: Hotel,
      label: "住宿",
      count: hotels.length,
      variant: "hotels" as const,
      hasDot: hotels.length > 0,
    },
    { icon: Car, label: "租车", count: 0 },
    { icon: Train, label: "火车", count: 0 },
    { icon: Paperclip, label: "附件", count: 0 },
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
            onClick={() => item.variant && openSection(item.variant)}
          >
            <div className="relative">
              <item.icon
                className={
                  item.variant && expanded[item.variant]
                    ? "h-6 w-6 text-orange-500"
                    : "h-6 w-6 text-gray-700"
                }
              />
              {item.hasDot && (
                <div className="absolute -top-1 -right-1 h-2 w-2 bg-orange-500 rounded-full" />
              )}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-gray-600">{item.label}</span>
              {item.count > 0 && (
                <span className="text-xs font-semibold text-gray-900">
                  {item.count}
                </span>
              )}
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
