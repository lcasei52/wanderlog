"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { eachDayOfInterval, format } from "date-fns";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";
import HotelCard from "./HotelCard";
import DateRangeField from "./DateRangeField";
import SortableCardGroup from "@/components/SortableCardGroup";
import PlaceSearchInput from "@/components/PlaceSearchInput";
import type { PlaceSearchResult } from "@/hooks/usePlaceSearch";
import type { PlaceItemInput, PlacePoi } from "@/types/place";
import { useBookings } from "@/context/bookings-context";
import { usePlaces } from "@/context/places-context";
import { useHistory } from "@/context/history-context";
import ListShell from "./ListShell";

/** 概览区的 Hotels 列表：已入库住宿的卡片 + 「添加一个住宿」弹窗 */
export default function HotelsList() {
  const { hotels, deleteHotel, addHotel, expanded, setExpanded, reorderHotels } =
    useBookings();
  const { dateRange, days, addItem } = usePlaces();
  // 加住宿要挂出一串酒店地点卡（跨 N 天是 2N-2 张），整段包进 batch 才对得上"一个手势"
  const { batch } = useHistory();

  const [showHotelDialog, setShowHotelDialog] = useState(false);
  const [hotelForm, setHotelForm] = useState<{
    poi: PlacePoi | null;
    dateRange: DateRange | undefined;
  }>({ poi: null, dateRange: undefined });
  const [hotelAdding, setHotelAdding] = useState(false);

  const tripDisabled =
    dateRange?.from && dateRange?.to
      ? { before: dateRange.from, after: dateRange.to }
      : undefined;

  const openHotelDialog = () => {
    setHotelForm({ poi: null, dateRange: undefined });
    setShowHotelDialog(true);
  };

  /**
   * 入住→退房每天各挂一份酒店地点实例：
   * 入住日放当天末尾（晚上回酒店）、退房日放当天开头（早上退房走）、
   * 中间每天首尾各放一份（早上在酒店 / 晚上回酒店）。
   *
   * 返回的 promise 要 await 住：这一串地点实例是"加住宿"这个手势的一部分，
   * 撤销栈得在整个手势结束前把它们记全（见 history-context 的 batch）。
   */
  const addHotelItems = async (
    created: Awaited<ReturnType<typeof addHotel>>,
    poi: PlacePoi,
    range: DateRange,
  ): Promise<void> => {
    if (
      !created ||
      created.lng == null ||
      created.lat == null ||
      !range.from ||
      !range.to
    ) {
      return;
    }
    const checkInIso = format(range.from, "yyyy-MM-dd");
    const checkOutIso = format(range.to, "yyyy-MM-dd");
    const tripDates = new Set(days.map((d) => d.dayDate));
    const input: PlaceItemInput = {
      groupKey: poi.id || `${created.lng},${created.lat}`,
      name: poi.name,
      address: poi.address ?? null,
      lng: created.lng,
      lat: created.lat,
      sourceKind: "hotel", // 删除该住宿时级联删除这些自动生成的酒店地点
      sourceId: created.id,
    };
    // 收齐所有 promise 再一起等：并发送出（串行是延迟相加），但都回来才算这次手势做完
    const pending: Promise<unknown>[] = [];
    const placeAt = (dayDate: string, atStart: boolean) => {
      if (!tripDates.has(dayDate)) return; // 该日不在行程内 → 不加
      pending.push(
        addItem(input, { kind: "day", dayDate }, { select: false, atStart })
      );
    };
    eachDayOfInterval({ start: range.from, end: range.to }).forEach((d) => {
      const iso = format(d, "yyyy-MM-dd");
      const isFirst = iso === checkInIso;
      const isLast = iso === checkOutIso;
      if (isFirst && isLast) {
        placeAt(iso, true); // 同一天入住又退房：首尾各一份
        placeAt(iso, false);
      } else if (isFirst) {
        placeAt(iso, false); // 入住日 → 末尾
      } else if (isLast) {
        placeAt(iso, true); // 退房日 → 开头
      } else {
        placeAt(iso, true); // 中间天 → 首尾各一
        placeAt(iso, false);
      }
    });
    await Promise.all(pending);
  };

  const handleAddHotel = async () => {
    const poi = hotelForm.poi;
    const range = hotelForm.dateRange;
    if (!poi || !range?.from || !range?.to) return;

    const checkInIso = format(range.from, "yyyy-MM-dd");
    const checkOutIso = format(range.to, "yyyy-MM-dd");

    setHotelAdding(true);
    try {
      // 整段是一个手势：入库住宿 + 每一天挂出的酒店地点卡。batch 让撤销栈只记第一份
      // 快照（= 动手之前），按一下撤销这一串一起退回去。
      const ok = await batch(async () => {
        const created = await addHotel({
          name: poi.name,
          address: poi.address ?? null,
          lng: poi.location?.lng ?? null,
          lat: poi.location?.lat ?? null,
          checkIn: checkInIso,
          checkOut: checkOutIso,
          checkInDate: checkInIso,
        });
        if (!created) return false;
        await addHotelItems(created, poi, range);
        return true;
      });
      if (!ok) {
        toast.error("添加失败，请重试");
        return;
      }
      toast.success("住宿已添加");
      setShowHotelDialog(false);
      setHotelForm({ poi: null, dateRange: undefined });
    } catch (error) {
      console.error("添加住宿失败:", error);
      toast.error("添加失败，请重试");
    } finally {
      setHotelAdding(false);
    }
  };

  const handleDeleteHotel = async (id: string) => {
    try {
      // 酒店地点与费用的清理收在 deleteHotel 里了（它才知道这个动作的全部后果）
      await deleteHotel(id);
      toast.success("住宿已删除");
    } catch {
      toast.error("删除失败，请重试");
    }
  };

  const handlePlaceSelect = (result: PlaceSearchResult) => {
    setHotelForm((f) => ({ ...f, poi: result }));
  };

  return (
    <>
      <ListShell
        anchorId="list-hotels"
        title="Hotels and lodging"
        expanded={expanded.hotels}
        onExpandedChange={(v) => setExpanded("hotels", v)}
      >
        {/* 卡片自带 hover 手柄/垃圾桶，可在本列表内拖动排序 */}
        <SortableCardGroup
          ids={hotels.map((h) => h.id)}
          onReorder={reorderHotels}
          onDelete={handleDeleteHotel}
          deleteTitle="删除这个住宿"
          renderItem={(id) => {
            const hotel = hotels.find((h) => h.id === id);
            return hotel ? <HotelCard hotel={hotel} /> : null;
          }}
        />
        {/* mt-2：同 FlightsList 那个「+ 添加一个航班」，只加上边距、下边距不变 */}
        <Button
          variant="link"
          className="mt-2 text-sm text-gray-400 hover:text-gray-600 p-0 h-auto"
          onClick={openHotelDialog}
        >
          + 添加一个住宿
        </Button>
      </ListShell>

      {/* 住宿弹窗 */}
      <Dialog open={showHotelDialog} onOpenChange={setShowHotelDialog}>
        {/* 酒店名/地址偏长，比默认的 sm:max-w-sm 放宽一档 */}
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加住宿</DialogTitle>
          </DialogHeader>
          {/* min-w-0：DialogContent 是 grid，grid 子项默认 min-width:auto，
              长文本（尤其是没有空格的英文名）会把列撑到超过弹窗宽度、直接溢到框外 */}
          <div className="space-y-4 py-4 min-w-0">
            <div>
              <Label>酒店</Label>
              <div className="mt-2 min-w-0">
                {hotelForm.poi ? (
                  <div className="flex items-start justify-between gap-2 rounded-lg border border-gray-200 p-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      {/* wrap-break-word：名字换行撑高，而不是横向溢出去 */}
                      <p className="text-sm font-medium text-gray-900 wrap-break-word">
                        {hotelForm.poi.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {hotelForm.poi.address}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs shrink-0"
                      onClick={() => setHotelForm((f) => ({ ...f, poi: null }))}
                    >
                      重新搜索
                    </Button>
                  </div>
                ) : (
                  <PlaceSearchInput
                    placeholder="搜索酒店名称或地址"
                    onPlaceSelect={handlePlaceSelect}
                  />
                )}
              </div>
            </div>

            <div>
              <Label>入住和退房日期</Label>
              <div className="mt-2">
                <DateRangeField
                  value={hotelForm.dateRange}
                  onChange={(range) =>
                    setHotelForm((f) => ({ ...f, dateRange: range }))
                  }
                  disabled={tripDisabled}
                  fallbackMonth={dateRange?.from}
                  size="default"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                只能选择行程日期范围内的日期
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowHotelDialog(false)}>
              取消
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              disabled={
                !hotelForm.poi ||
                !hotelForm.dateRange?.from ||
                !hotelForm.dateRange?.to ||
                hotelAdding
              }
              onClick={handleAddHotel}
            >
              {hotelAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "添加住宿"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
