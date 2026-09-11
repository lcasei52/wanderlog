"use client";

import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDateStringDisplay } from "@/lib/date-helpers";
import type { Flight } from "@/db/schema";

/**
 * 航班卡（纯展示）：拖动排序 / 删除由外层 SortableCardGroup 提供
 * —— 手柄和垃圾桶浮在卡片外面的左右两侧。
 */
export default function FlightCard({ flight }: { flight: Flight }) {
  return (
    <Card className="bg-gray-50 p-4 border-0">
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
        {formatDateStringDisplay(flight.date)} • {flight.departureTime} — {flight.arrivalTime}
      </div>
      <div className="text-xs text-gray-500 mt-1 uppercase">
        {flight.flightNumber}
      </div>
    </Card>
  );
}
