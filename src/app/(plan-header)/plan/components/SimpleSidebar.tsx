"use client";

import { useState } from "react";
import { parse, format, differenceInDays, addDays } from "date-fns";
import { Sparkles, ChevronLeft } from "lucide-react";
import type { TripSummary } from "@/types/trip";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function SimpleSidebar({ trip }: { trip?: TripSummary }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 由行程起止日期算出每天的标签
  const from = trip?.startDate
    ? parse(trip.startDate, "yyyy-MM-dd", new Date())
    : undefined;
  const to = trip?.endDate
    ? parse(trip.endDate, "yyyy-MM-dd", new Date())
    : undefined;
  const dayDates =
    from && to && to >= from
      ? Array.from({ length: differenceInDays(to, from) + 1 }, (_, i) =>
          addDays(from, i),
        )
      : [];
  const dateText =
    from && to
      ? `${format(from, "yyyy年M月d日")} - ${format(to, "yyyy年M月d日")}`
      : "未设置日期";

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isCollapsed) {
    return (
      <div className="w-12 border-r flex items-center justify-center bg-gray-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="rotate-180"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <aside className="w-80 border-r flex flex-col h-full bg-white">
      {/* 顶部：AI助手 */}
      <div className="p-4 bg-gradient-to-r from-orange-50 to-orange-100 border-b">
        <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-full flex items-center justify-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="font-medium">AI 助手</span>
        </Button>
      </div>

      {/* 中间：可滚动内容 */}
      <div className="flex-1 overflow-y-auto">
        <Accordion type="multiple" defaultValue={["overview", "itinerary"]} className="w-full">
          {/* 概览 */}
          <AccordionItem value="overview" className="border-b">
            <AccordionTrigger
              className="px-4 py-3 hover:bg-gray-50"
              onClick={() => scrollToSection("overview")}
            >
              <span className="font-medium">概览</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-3 text-sm text-gray-600">
                <div>
                  <p className="font-medium text-gray-900 mb-1">行程名称</p>
                  <p>{trip?.name ?? "未命名行程"}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-900 mb-1">日期</p>
                  <p>{dateText}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-900 mb-1">协作者</p>
                  <p>暂无协作者</p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* 行程 */}
          <AccordionItem value="itinerary" className="border-b">
            <AccordionTrigger
              className="px-4 py-3 hover:bg-gray-50"
              onClick={() => scrollToSection("itinerary")}
            >
              <span className="font-medium">行程</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-2">
                {dayDates.length > 0 ? (
                  dayDates.map((date, i) => (
                    <div key={date.toISOString()} className="p-3 bg-gray-50 rounded-lg">
                      <p className="font-medium text-sm">
                        Day {i + 1} - {format(date, "M月d日")}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">0 个地点</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-500">先设置行程日期</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 text-orange-600 border-orange-300 hover:bg-orange-50"
                >
                  + 添加一天
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* 预算 */}
          <AccordionItem value="budget" className="border-b">
            <AccordionTrigger
              className="px-4 py-3 hover:bg-gray-50"
              onClick={() => scrollToSection("budget")}
            >
              <span className="font-medium">预算</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="text-sm text-gray-600">
                <p className="mb-2">总预算: ¥0</p>
                <p className="text-xs">已花费: ¥0</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3 text-orange-600 border-orange-300 hover:bg-orange-50"
                >
                  + 添加支出
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* 底部：隐藏侧边栏 */}
      <div className="p-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(true)}
          className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>隐藏侧边栏</span>
        </Button>
      </div>
    </aside>
  );
}
