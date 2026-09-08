"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, MoreHorizontal, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { type DateRange } from "react-day-picker";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import FlightCard from "./FlightCard";
import HotelCard from "./HotelCard";

type VariantType = "notes" | "flights" | "hotels" | "default";

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

interface CollapsibleListItemProps {
  title: string;
  variant: VariantType;
  count?: number;
  onDelete: () => void;
  onTitleChange: (newTitle: string) => void;
  flights?: Flight[];
  hotels?: Hotel[];
  onFlightsChange?: (flights: Flight[]) => void;
  onHotelsChange?: (hotels: Hotel[]) => void;
  isExpanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
}

export default function CollapsibleListItem({
  title,
  variant,
  count,
  onDelete,
  onTitleChange,
  flights: externalFlights,
  hotels: externalHotels,
  onFlightsChange,
  onHotelsChange,
  isExpanded: externalIsExpanded,
  onExpandChange,
}: CollapsibleListItemProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);
  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;
  const setIsExpanded = (value: boolean) => {
    if (onExpandChange) {
      onExpandChange(value);
    } else {
      setInternalIsExpanded(value);
    }
  };

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [listTitle, setListTitle] = useState(title);
  const [showFlightDialog, setShowFlightDialog] = useState(false);
  const [showHotelDialog, setShowHotelDialog] = useState(false);

  // 航班和酒店数据 - 使用外部状态或内部状态
  const flights = externalFlights ?? [];
  const setFlights = onFlightsChange ?? (() => {});
  const hotels = externalHotels ?? [];
  const setHotels = onHotelsChange ?? (() => {});

  // 表单数据
  const [flightForm, setFlightForm] = useState({
    airline: "",
    flightNumber: "",
  });
  const [hotelForm, setHotelForm] = useState({
    hotelName: "",
    dateRange: undefined as DateRange | undefined,
  });

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    onTitleChange(listTitle);
  };

  const handleAddFlight = () => {
    if (!flightForm.airline || !flightForm.flightNumber) {
      return; // 验证必填项
    }

    // 模拟通过航司+航班号搜索航班信息
    // 实际应该调用航班API，这里用 dummy 数据
    const mockFlightData = [
      {
        from: "WUH",
        fromCity: "Wuhan",
        to: "SIN",
        toCity: "Singapore",
        date: "周四, 9月 24",
        departureTime: "0:55",
        arrivalTime: "5:40",
      },
      {
        from: "PEK",
        fromCity: "Beijing",
        to: "PVG",
        toCity: "Shanghai",
        date: "周五, 9月 25",
        departureTime: "10:30",
        arrivalTime: "13:00",
      },
    ];

    // 随机选一个模拟数据
    const mockData = mockFlightData[Math.floor(Math.random() * mockFlightData.length)];

    const newFlight: Flight = {
      id: Date.now().toString(),
      ...mockData,
      flightNumber: `${flightForm.airline} ${flightForm.flightNumber}`,
    };

    setFlights([...flights, newFlight]);
    setShowFlightDialog(false);
    setFlightForm({ airline: "", flightNumber: "" });
  };

  const handleDeleteFlight = (id: string) => {
    setFlights(flights.filter((f) => f.id !== id));
  };

  const handleAddHotel = () => {
    if (!hotelForm.hotelName || !hotelForm.dateRange?.from || !hotelForm.dateRange?.to) {
      return; // 验证必填项
    }

    // 创建酒店数据（地址是 dummy）
    const newHotel: Hotel = {
      id: Date.now().toString(),
      name: hotelForm.hotelName,
      address: "945 Ao Nang, Mueang Krabi District, Krabi 81180, Thailand", // Dummy 地址
      checkIn: format(hotelForm.dateRange.from, "周E, M月 d日", { locale: zhCN }),
      checkOut: format(hotelForm.dateRange.to, "周E, M月 d日", { locale: zhCN }),
    };
    setHotels([...hotels, newHotel]);
    setShowHotelDialog(false);
    setHotelForm({ hotelName: "", dateRange: undefined });
  };

  const handleDeleteHotel = (id: string) => {
    setHotels(hotels.filter((h) => h.id !== id));
  };

  const renderExpandedContent = () => {
    switch (variant) {
      case "notes":
        return (
          <div className="pb-5 px-6 pl-14">
            <Textarea
              placeholder="在此处撰写或粘贴任何内容：如何出行，提示和技巧"
              className="min-h-[120px] resize-none border-gray-200 focus:border-orange-300"
            />
          </div>
        );

      case "flights":
        return (
          <div className="pb-5 px-6 pl-14">
            {/* 显示已添加的航班 */}
            {flights.map((flight) => (
              <FlightCard
                key={flight.id}
                flight={flight}
                onDelete={() => handleDeleteFlight(flight.id)}
              />
            ))}

            {/* 添加航班按钮 */}
            <Button
              variant="link"
              className="text-sm text-gray-400 hover:text-gray-600 p-0 h-auto"
              onClick={() => setShowFlightDialog(true)}
            >
              + 添加一个航班
            </Button>
          </div>
        );

      case "hotels":
        return (
          <div className="pb-5 px-6 pl-14">
            {/* 显示已添加的酒店 */}
            {hotels.map((hotel) => (
              <HotelCard
                key={hotel.id}
                hotel={hotel}
                onDelete={() => handleDeleteHotel(hotel.id)}
              />
            ))}

            {/* 添加住宿按钮 */}
            <Button
              variant="link"
              className="text-sm text-gray-400 hover:text-gray-600 p-0 h-auto"
              onClick={() => setShowHotelDialog(true)}
            >
              + 添加一个住宿
            </Button>
          </div>
        );

      case "default":
        return (
          <div className="pb-5 px-6 pl-14">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="添加地点"
                className="flex-1 border-0 border-b border-gray-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-orange-300"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="border-b last:border-b-0" id={`list-${variant}`}>
        <div className="flex items-center gap-2 py-5 px-6">
          {/* 展开/收起箭头 */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </Button>

          {/* 标题 - 可编辑 */}
          {isEditingTitle ? (
            <Input
              value={listTitle}
              onChange={(e) => setListTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleTitleSubmit();
                } else if (e.key === "Escape") {
                  setIsEditingTitle(false);
                  setListTitle(title);
                }
              }}
              className="flex-1 h-auto text-base font-semibold border-0 border-b-2 border-blue-500 rounded-none px-0 py-0 focus-visible:ring-0"
              autoFocus
            />
          ) : (
            <h4
              className="flex-1 text-base font-semibold text-gray-900 cursor-pointer hover:text-gray-700 transition-colors"
              onClick={() => setIsEditingTitle(true)}
            >
              {listTitle}
            </h4>
          )}

          {/* 计数 */}
          {count !== undefined && count > 0 && (
            <span className="text-sm text-gray-500">{count} 个地点</span>
          )}

          {/* 更多选项菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={onDelete}
              >
                删除列表
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 展开的内容 */}
        {isExpanded && renderExpandedContent()}
      </div>

      {/* 航班弹窗 */}
      <Dialog open={showFlightDialog} onOpenChange={setShowFlightDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加航班</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="airline">航空公司</Label>
              <Input
                id="airline"
                placeholder="例如：中国国航"
                className="mt-2"
                value={flightForm.airline}
                onChange={(e) =>
                  setFlightForm({ ...flightForm, airline: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="flightNumber">航班号</Label>
              <Input
                id="flightNumber"
                placeholder="例如：CA1234"
                className="mt-2"
                value={flightForm.flightNumber}
                onChange={(e) =>
                  setFlightForm({ ...flightForm, flightNumber: e.target.value })
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowFlightDialog(false)}>
              取消
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              onClick={handleAddFlight}
            >
              添加
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 住宿弹窗 */}
      <Dialog open={showHotelDialog} onOpenChange={setShowHotelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加住宿</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="hotelName">酒店名称</Label>
              <Input
                id="hotelName"
                placeholder="例如：Panan Krabi Resort"
                className="mt-2"
                value={hotelForm.hotelName}
                onChange={(e) =>
                  setHotelForm({ ...hotelForm, hotelName: e.target.value })
                }
              />
            </div>
            <div>
              <Label>入住和退房日期</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full mt-2 justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {hotelForm.dateRange?.from && hotelForm.dateRange?.to ? (
                      <>
                        {format(hotelForm.dateRange.from, "M月d日", { locale: zhCN })} -{" "}
                        {format(hotelForm.dateRange.to, "M月d日", { locale: zhCN })}
                      </>
                    ) : (
                      <span className="text-gray-500">选择日期范围</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={hotelForm.dateRange}
                    onSelect={(range) =>
                      setHotelForm({ ...hotelForm, dateRange: range })
                    }
                    numberOfMonths={2}
                    locale={zhCN}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowHotelDialog(false)}>
              取消
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              onClick={handleAddHotel}
            >
              添加
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
