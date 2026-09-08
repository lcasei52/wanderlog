"use client";

import { GripVertical, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface HotelCardProps {
  hotel: {
    id: string;
    name: string;
    address: string;
    checkIn: string;
    checkOut: string;
  };
  onDelete: () => void;
}

export default function HotelCard({ hotel, onDelete }: HotelCardProps) {
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

      {/* 酒店名称 */}
      <div className="text-base font-semibold text-gray-900 mb-1">
        {hotel.name}
      </div>

      {/* 地址 */}
      <div className="text-sm text-gray-500 mb-3">
        {hotel.address}
      </div>

      {/* 入住和退房日期 */}
      <div className="text-sm text-gray-700">
        {hotel.checkIn} — {hotel.checkOut}
      </div>
    </Card>
  );
}
