"use client";

import { useState, useRef } from "react";
import { ImagePlus, Calendar as CalendarIcon } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type DateRange } from "react-day-picker";
import { format, differenceInDays, addDays } from "date-fns";
import { zhCN } from "date-fns/locale";
import TripHeaderCard from "./TripHeaderCard";
import BookingCard from "./overview/BookingCard";
import BudgetCard from "./overview/BudgetCard";
import CollapsibleListItem from "./overview/CollapsibleListItem";
import DayCard from "./itinerary/DayCard";

interface Flight {
  id: string;
  from: string;
  fromCity: string;
  to: string;
  toCity: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  flightNumber: string;
}

interface Hotel {
  id: string;
  name: string;
  address: string;
  checkIn: string;
  checkOut: string;
}

interface Place {
  id: string;
  name: string;
}

export default function DetailContent() {
  const overviewRef = useRef<HTMLDivElement>(null);
  const itineraryRef = useRef<HTMLDivElement>(null);
  const budgetRef = useRef<HTMLDivElement>(null);

  // 日期范围状态
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(2024, 2, 15), // 3月15日
    to: new Date(2024, 2, 20), // 3月20日
  });

  const [lists, setLists] = useState([
    { id: "1", title: "Notes", variant: "notes" as const, count: 0 },
    { id: "2", title: "Flights", variant: "flights" as const, count: 0 },
    {
      id: "3",
      title: "Hotels and lodging",
      variant: "hotels" as const,
      count: 0,
    },
    {
      id: "4",
      title: "Places to visit",
      variant: "default" as const,
      count: 0,
    },
  ]);

  // 航班和酒店状态
  const [flights, setFlights] = useState<Flight[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);

  // 展开状态
  const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>({});

  // 每日行程数据
  const [dailyPlaces, setDailyPlaces] = useState<Record<number, Place[]>>({});

  const handleImageChange = () => {
    // 后续实现图片选择逻辑
    console.log("选择封面图片");
  };

  const handleDeleteList = (id: string) => {
    setLists(lists.filter((list) => list.id !== id));
  };

  const handleTitleChange = (id: string, newTitle: string) => {
    setLists(
      lists.map((list) =>
        list.id === id ? { ...list, title: newTitle } : list,
      ),
    );
  };

  const handleAddList = () => {
    const newList = {
      id: Date.now().toString(),
      title: "新列表",
      variant: "default" as const,
      count: 0,
    };
    setLists([...lists, newList]);
  };

  // 处理BookingCard图标点击
  const handleBookingItemClick = (variant: "flights" | "hotels") => {
    const element = document.getElementById(`list-${variant}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      // 展开对应的CollapsibleListItem
      setExpandedStates((prev) => ({ ...prev, [variant]: true }));
    }
  };

  // 处理添加地点
  const handleAddPlace = (dayNumber: number, placeName: string) => {
    const newPlace: Place = {
      id: Date.now().toString(),
      name: placeName,
    };
    setDailyPlaces((prev) => ({
      ...prev,
      [dayNumber]: [...(prev[dayNumber] || []), newPlace],
    }));
  };

  // 处理删除地点
  const handleDeletePlace = (dayNumber: number, placeId: string) => {
    setDailyPlaces((prev) => ({
      ...prev,
      [dayNumber]: (prev[dayNumber] || []).filter((p) => p.id !== placeId),
    }));
  };

  // 根据日期范围生成天数数组
  const getDays = () => {
    if (!dateRange?.from || !dateRange?.to) return [];

    const days = differenceInDays(dateRange.to, dateRange.from) + 1;
    return Array.from({ length: days }, (_, i) => ({
      dayNumber: i + 1,
      date: format(addDays(dateRange.from!, i), "M月d日", { locale: zhCN }),
    }));
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {/* 背景图区域 */}
      <div className="relative h-64 w-full bg-gradient-to-br from-orange-400 to-pink-400">
        {/* 暂时用渐变色代替图片 */}
        {/* <Image
          src="/placeholder-trip.jpg"
          alt="Trip background"
          fill
          className="object-cover"
        /> */}

        {/* 右上角：更换图片按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/40 hover:bg-black/60 text-white"
          onClick={handleImageChange}
          title="更换封面图片"
        >
          <ImagePlus className="h-5 w-5" />
        </Button>

        {/* 悬浮卡片 */}
        <div className="absolute inset-x-0 bottom-0 translate-y-1/2 px-6">
          <TripHeaderCard dateRange={dateRange} onDateRangeChange={setDateRange} />
        </div>
      </div>

      {/* 内容区域 - 给顶部留出空间 */}
      <div className="mt-24 px-6 pb-8 space-y-8">
        {/* 概览 */}
        <section ref={overviewRef} id="overview" className="scroll-mt-4">
          <h2 className="text-2xl font-bold mb-4 text-gray-900">概览</h2>

          {/* 顶部两个卡片 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="col-span-2">
              <BookingCard
                flightCount={flights.length}
                hotelCount={hotels.length}
                onItemClick={handleBookingItemClick}
              />
            </div>
            <div className="col-span-1">
              <BudgetCard />
            </div>
          </div>

          {/* 可折叠列表 */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {lists.map((list) => (
              <CollapsibleListItem
                key={list.id}
                title={list.title}
                variant={list.variant}
                count={list.count}
                onDelete={() => handleDeleteList(list.id)}
                onTitleChange={(newTitle: string) =>
                  handleTitleChange(list.id, newTitle)
                }
                flights={list.variant === "flights" ? flights : undefined}
                hotels={list.variant === "hotels" ? hotels : undefined}
                onFlightsChange={list.variant === "flights" ? setFlights : undefined}
                onHotelsChange={list.variant === "hotels" ? setHotels : undefined}
                isExpanded={expandedStates[list.variant]}
                onExpandChange={(expanded) =>
                  setExpandedStates((prev) => ({ ...prev, [list.variant]: expanded }))
                }
              />
            ))}
          </div>

          {/* 新建列表按钮 */}
          <Button
            variant="link"
            onClick={handleAddList}
            className="w-full mt-4 py-3 text-orange-600 hover:text-orange-700 font-medium h-auto"
          >
            + 新列表
          </Button>
        </section>

        {/* 行程 */}
        <section ref={itineraryRef} id="itinerary" className="scroll-mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">行程</h2>
            {/* 日期修改按钮 */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <CalendarIcon className="h-4 w-4" />
                  <span className="text-sm">
                    {dateRange?.from && dateRange?.to
                      ? `${format(dateRange.from, "M月d日", { locale: zhCN })} - ${format(dateRange.to, "M月d日", { locale: zhCN })}`
                      : "选择日期"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={zhCN}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-4">
            {getDays().map(({ dayNumber, date }) => (
              <DayCard
                key={dayNumber}
                dayNumber={dayNumber}
                date={date}
                places={dailyPlaces[dayNumber] || []}
                onAddPlace={handleAddPlace}
                onDeletePlace={handleDeletePlace}
              />
            ))}
          </div>
        </section>

        {/* 预算 */}
        <section ref={budgetRef} id="budget" className="scroll-mt-4">
          <h2 className="text-2xl font-bold mb-4 text-gray-900">预算</h2>
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-sm text-gray-500 mb-2">总预算</p>
              <p className="text-3xl font-bold text-gray-900">¥ 0</p>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">已花费</span>
                <span className="text-base font-semibold text-gray-900">
                  ¥ 0
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">剩余</span>
                <span className="text-base font-semibold text-green-600">
                  ¥ 0
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
