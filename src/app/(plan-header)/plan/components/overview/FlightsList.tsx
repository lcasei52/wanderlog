"use client";

import { useState } from "react";
import {
  ArrowRight,
  Calendar as CalendarIcon,
  Loader2,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import FlightCard from "./FlightCard";
import SortableCardGroup from "@/components/SortableCardGroup";
import { useBookings } from "@/context/bookings-context";
import { usePlaces } from "@/context/places-context";
import type { PlaceItemInput } from "@/types/place";
import type { FlightApiResult } from "@/types/flight";
import ListShell from "./ListShell";

/** 源数据时间是 UTC，统一 +8 转成北京时间（国内航班无夏令时） */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
function toBeijingDate(iso: string): Date {
  return new Date(new Date(iso).getTime() + BEIJING_OFFSET_MS);
}

/** 概览区的 Flights 列表：已入库航班的卡片 + 「添加一个航班」弹窗 */
export default function FlightsList() {
  const { flights, deleteFlight, addFlight, expanded, setExpanded, reorderFlights } =
    useBookings();
  const { dateRange, days, addItem, removeItemsBySource } = usePlaces();

  const [showFlightDialog, setShowFlightDialog] = useState(false);
  const [flightQuery, setFlightQuery] = useState("");
  const [flightSearching, setFlightSearching] = useState(false);
  const [flightResult, setFlightResult] = useState<FlightApiResult | null>(null);
  const [flightError, setFlightError] = useState<string | null>(null);
  const [flightDate, setFlightDate] = useState<Date | undefined>();
  const [flightAdding, setFlightAdding] = useState(false);

  const tripDisabled =
    dateRange?.from && dateRange?.to
      ? { before: dateRange.from, after: dateRange.to }
      : undefined;

  const openFlightDialog = () => {
    setFlightQuery("");
    setFlightResult(null);
    setFlightError(null);
    setFlightSearching(false);
    setFlightDate(dateRange?.from);
    setShowFlightDialog(true);
  };

  const searchFlight = async () => {
    const code = flightQuery.trim().toUpperCase();
    if (!code) return;
    setFlightSearching(true);
    setFlightError(null);
    setFlightResult(null);
    try {
      const res = await fetch(`/api/flights?flight_iata=${encodeURIComponent(code)}`);
      if (!res.ok) {
        setFlightError(
          res.status === 404 ? "未找到该航班，请检查航班号" : "查询失败，请稍后重试"
        );
        return;
      }
      const data = (await res.json()) as FlightApiResult;
      setFlightResult(data);
    } catch {
      setFlightError("查询失败，请检查网络");
    } finally {
      setFlightSearching(false);
    }
  };

  /** 在某天的行程内自动挂一份机场地点实例（出发/到达机场各调一次），绑定到所属航班 */
  const addAirportItem = (
    dayDate: string,
    flightId: string,
    leg: {
      code: string;
      airport: string;
      city: string | null;
      lng: number | null;
      lat: number | null;
    },
  ) => {
    // 只限制该日必须在行程内。机场坐标在国内映射表里才带（地图上可画 marker）；
    // 不在表里（如柳州 LZH 等中小机场/国际段）仍照常生成地点实例——只是没有坐标、
    // 仅显示在当天列表里，地图不画。不能因为缺坐标就把降落/起飞机场整个漏掉。
    if (!days.some((d) => d.dayDate === dayDate)) return;
    const input: PlaceItemInput = {
      groupKey: `airport-${leg.code}`,
      name: leg.airport,
      address: leg.city ?? null,
      lng: leg.lng ?? null,
      lat: leg.lat ?? null,
      sourceKind: "flight", // 删除航班时级联删除这两份机场地点
      sourceId: flightId,
    };
    addItem(input, { kind: "day", dayDate }, { select: false });
  };

  const handleAddFlight = async () => {
    const result = flightResult;
    if (!result || !flightDate) return;
    const { departure, arrival } = result;
    if (!departure.time || !arrival.time) {
      toast.error("该航班缺少起降时刻，无法添加");
      return;
    }

    // 源时间是 UTC，+8 得到北京时间；arrival 相对 departure 的天数差决定"到达日"
    const depBJ = toBeijingDate(departure.time);
    const arrBJ = toBeijingDate(arrival.time);
    const dayOffset = differenceInCalendarDays(arrBJ, depBJ);
    const depDateIso = format(flightDate, "yyyy-MM-dd");
    const arrDateIso = format(addDays(flightDate, dayOffset), "yyyy-MM-dd");

    setFlightAdding(true);
    try {
      const created = await addFlight({
        from: departure.city ?? departure.code,
        fromCity: departure.airport,
        to: arrival.city ?? arrival.code,
        toCity: arrival.airport,
        date: depDateIso,
        departureTime: format(depBJ, "HH:mm"),
        arrivalTime: format(arrBJ, "HH:mm"),
        flightNumber: result.flightNumber,
        arrivalDate: arrDateIso,
        arrivalLng: arrival.lng,
        arrivalLat: arrival.lat,
      });
      if (!created) {
        toast.error("添加失败，请重试");
        return;
      }
      // 出发机场挂出发日、到达机场挂到达日（仅要求该日在行程内，坐标可有可无），都绑定到该航班
      addAirportItem(depDateIso, created.id, {
        code: departure.code,
        airport: departure.airport,
        city: departure.city,
        lng: departure.lng ?? null,
        lat: departure.lat ?? null,
      });
      addAirportItem(arrDateIso, created.id, {
        code: arrival.code,
        airport: arrival.airport,
        city: arrival.city,
        lng: arrival.lng ?? created.arrivalLng ?? null,
        lat: arrival.lat ?? created.arrivalLat ?? null,
      });
      toast.success("航班已添加");
      setShowFlightDialog(false);
      setFlightResult(null);
      setFlightQuery("");
    } catch (error) {
      console.error("添加航班失败:", error);
      toast.error("添加失败，请重试");
    } finally {
      setFlightAdding(false);
    }
  };

  const handleDeleteFlight = async (id: string) => {
    try {
      await deleteFlight(id);
      removeItemsBySource("flight", id); // 同步清掉该航班自动生成的机场地点
      toast.success("航班已删除");
    } catch {
      toast.error("删除失败，请重试");
    }
  };

  return (
    <>
      <ListShell
        anchorId="list-flights"
        title="Flights"
        expanded={expanded.flights}
        onExpandedChange={(v) => setExpanded("flights", v)}
      >
        {/* 卡片自带 hover 手柄/垃圾桶，可在本列表内拖动排序 */}
        <SortableCardGroup
          ids={flights.map((f) => f.id)}
          onReorder={reorderFlights}
          onDelete={handleDeleteFlight}
          deleteTitle="删除这个航班"
          renderItem={(id) => {
            const flight = flights.find((f) => f.id === id);
            return flight ? <FlightCard flight={flight} /> : null;
          }}
        />
        <Button
          variant="link"
          className="text-sm text-gray-400 hover:text-gray-600 p-0 h-auto"
          onClick={openFlightDialog}
        >
          + 添加一个航班
        </Button>
      </ListShell>

      {/* 航班弹窗 */}
      <Dialog open={showFlightDialog} onOpenChange={setShowFlightDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加航班</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="flightNumber">航班号</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  id="flightNumber"
                  placeholder="例如：CA1234 / MU5102"
                  className="uppercase flex-1"
                  value={flightQuery}
                  onChange={(e) => setFlightQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !flightSearching) searchFlight();
                  }}
                />
                <Button
                  variant="outline"
                  onClick={searchFlight}
                  disabled={!flightQuery.trim() || flightSearching}
                  className="flex-shrink-0"
                >
                  {flightSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="ml-1">查询</span>
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                输入完整航班号，查询该航班的真实时刻与航线（国内航班）
              </p>
            </div>

            {flightError && <p className="text-sm text-red-500">{flightError}</p>}

            {flightResult &&
              flightResult.departure.time &&
              flightResult.arrival.time && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-lg font-bold text-gray-900">
                        {format(
                          toBeijingDate(flightResult.departure.time),
                          "HH:mm"
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {flightResult.departure.city ?? flightResult.departure.code}
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="text-lg font-bold text-gray-900">
                        {format(toBeijingDate(flightResult.arrival.time), "HH:mm")}
                      </div>
                      <div className="text-sm text-gray-500">
                        {flightResult.arrival.city ?? flightResult.arrival.code}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {flightResult.airline} {flightResult.flightNumber} ·{" "}
                    {flightResult.departure.airport} →{" "}
                    {flightResult.arrival.airport}
                  </div>
                  <div>
                    <Label>出发日期（行程内）</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full mt-1 justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {flightDate ? (
                            format(flightDate, "yyyy年M月d日 EEE", { locale: zhCN })
                          ) : (
                            <span className="text-gray-500">选择出发日期</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={flightDate}
                          onSelect={setFlightDate}
                          disabled={tripDisabled}
                          defaultMonth={flightDate ?? dateRange?.from}
                          numberOfMonths={2}
                          locale={zhCN}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowFlightDialog(false)}>
              取消
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              disabled={!flightResult || !flightDate || flightAdding}
              onClick={handleAddFlight}
            >
              {flightAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "添加航班"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
