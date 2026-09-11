"use client";

import { Card } from "@/components/ui/card";
import { formatDateStringDisplay } from "@/lib/date-helpers";
import type { Hotel } from "@/db/schema";

/**
 * 住宿卡（纯展示）：拖动排序 / 删除由外层 SortableCardGroup 提供
 * —— 手柄和垃圾桶浮在卡片外面的左右两侧。
 */
export default function HotelCard({ hotel }: { hotel: Hotel }) {
  return (
    <Card className="bg-gray-50 p-4 border-0">
      {/* 酒店名称 */}
      <div className="text-base font-semibold text-gray-900 mb-1">
        {hotel.name}
      </div>

      {/* 地址 */}
      <div className="text-sm text-gray-500 mb-3">
        {hotel.address || "地址待补充"}
      </div>

      {/* 入住和退房日期 */}
      <div className="text-sm text-gray-700">
        {formatDateStringDisplay(hotel.checkIn)} — {formatDateStringDisplay(hotel.checkOut)}
      </div>
    </Card>
  );
}
