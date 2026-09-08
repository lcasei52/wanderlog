"use client";

import { GripVertical, Trash2, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface FlightCardProps {
  flight: {
    id: string;
    from: string;
    fromCity: string;
    to: string;
    toCity: string;
    date: string;
    departureTime: string;
    arrivalTime: string;
    flightNumber: string;
  };
  onDelete: () => void;
}

export default function FlightCard({ flight, onDelete }: FlightCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card
      className="relative bg-gray-50 p-4 mb-3 border-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hover 时显示的拖拽和删除图标 */}
      {isHovered && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 bg-white rounded shadow-md hover:bg-gray-50 cursor-grab active:cursor-grabbing"
            title="拖动排序"
          >
            <GripVertical className="h-4 w-4 text-gray-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 bg-white rounded shadow-md hover:bg-red-50"
            onClick={onDelete}
            title="删除"
          >
            <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-600" />
          </Button>
        </>
      )}

      <div className="flex items-center gap-4">
        {/* 出发地 */}
        <div>
          <div className="text-lg font-bold text-gray-900">{flight.from}</div>
          <div className="text-sm text-gray-500">{flight.fromCity}</div>
        </div>

        {/* 箭头 */}
        <ArrowRight className="h-5 w-5 text-gray-400" />

        {/* 目的地 */}
        <div>
          <div className="text-lg font-bold text-gray-900">{flight.to}</div>
          <div className="text-sm text-gray-500">{flight.toCity}</div>
        </div>
      </div>

      {/* 时间和航班号 */}
      <div className="mt-3 text-sm text-gray-700">
        {flight.date} • {flight.departureTime} — {flight.arrivalTime}
      </div>
      <div className="text-xs text-gray-500 mt-1 uppercase">
        {flight.flightNumber}
      </div>
    </Card>
  );
}
