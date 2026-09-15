"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { parse, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDateStringDisplay } from "@/lib/date-helpers";
import { useBookings } from "@/context/bookings-context";
import { usePlaces } from "@/context/places-context";
import DateRangeField from "./DateRangeField";
import type { Hotel } from "@/db/schema";

/**
 * 住宿卡：点一下展开成编辑表单（酒店名/地址/入住退房日期/费用）。
 * 拖动排序 / 删除由外层 SortableCardGroup 提供 —— 手柄和垃圾桶浮在卡片外面，
 * 卡片本身不是拖拽热区，所以卡内放输入框不会和拖动打架。
 *
 * 和 FlightCard 一样用**显式保存按钮**：一次写完，不学 PlaceCard 的失焦自动保存。
 */
interface HotelDraft {
  name: string;
  address: string;
  checkIn: string; // "yyyy-MM-dd"
  checkOut: string; // "yyyy-MM-dd"
  /**
   * 费用只活在这个 draft 里 —— hotels 表还没有 cost 列，保存时不写，
   * 刷新就没了。等费用真正要做时再补列 + 接进 patch。
   */
  cost: string;
}

function toDraft(h: Hotel): HotelDraft {
  return {
    name: h.name,
    address: h.address ?? "",
    checkIn: h.checkIn,
    checkOut: h.checkOut,
    cost: "",
  };
}

/**
 * "yyyy-MM-dd" 字符串 → DateRange。必须走 date-fns 的 parse：
 * new Date("2024-09-20") 是按 UTC 解析的，时区一偏就整天错位。
 */
function toRange(checkIn: string, checkOut: string): DateRange | undefined {
  if (!checkIn) return undefined;
  const from = parse(checkIn, "yyyy-MM-dd", new Date());
  const to = checkOut ? parse(checkOut, "yyyy-MM-dd", new Date()) : undefined;
  return { from, to };
}

export default function HotelCard({ hotel }: { hotel: Hotel }) {
  const { updateHotel } = useBookings();
  const { dateRange } = usePlaces();

  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<HotelDraft>(() => toDraft(hotel));

  const tripDisabled =
    dateRange?.from && dateRange?.to
      ? { before: dateRange.from, after: dateRange.to }
      : undefined;

  const set = <K extends keyof HotelDraft>(key: K, value: HotelDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const setRange = (range: DateRange | undefined) =>
    setDraft((prev) => ({
      ...prev,
      checkIn: range?.from ? format(range.from, "yyyy-MM-dd") : "",
      checkOut: range?.to ? format(range.to, "yyyy-MM-dd") : "",
    }));

  const handleSave = async () => {
    // hotels.name / check_in / check_out 都是 notNull，三格不能空
    const missing = !draft.name.trim()
      ? "酒店名"
      : !draft.checkIn
        ? "入住日期"
        : !draft.checkOut
          ? "退房日期"
          : null;
    if (missing) {
      toast.error(`请填写${missing}`);
      return;
    }

    setSaving(true);
    try {
      const row = await updateHotel(hotel.id, {
        name: draft.name.trim(),
        address: draft.address.trim() || null,
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        // checkInDate 建的时候就是 checkIn 的副本（当初用来匹配 day），一起同步
        checkInDate: draft.checkIn,
      });
      if (!row) {
        toast.error("保存失败，请重试");
        return;
      }
      setDraft(toDraft(row)); // 以入库后的整行为准回填
      setExpanded(false);
      toast.success("住宿已更新");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-gray-50 p-4 border-0">
      {/*
        头部 = 折叠态摘要，整块可点开/收起。
        展开的表单是它的**兄弟节点**而不是子节点 —— role="button" 里不能套输入框。
        收起时不重置 draft：手滑点掉卡片不该丢输入，只有保存/取消才重置。
      */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault(); // 空格默认会滚动页面
            setExpanded((v) => !v);
          }
        }}
        className="cursor-pointer select-none"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-gray-900">
              {hotel.name}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {hotel.address || "地址待补充"}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform motion-reduce:transition-none",
              expanded && "rotate-180"
            )}
          />
        </div>

        <div className="text-sm text-gray-700 mt-3">
          {formatDateStringDisplay(hotel.checkIn)} —{" "}
          {formatDateStringDisplay(hotel.checkOut)}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs font-normal text-gray-500">酒店名</Label>
            <Input
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              className="h-8"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-normal text-gray-500">地址</Label>
            <Input
              value={draft.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="如：中山东一路12号"
              className="h-8"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-normal text-gray-500">
              入住和退房日期
            </Label>
            <DateRangeField
              value={toRange(draft.checkIn, draft.checkOut)}
              onChange={setRange}
              disabled={tripDisabled}
              fallbackMonth={dateRange?.from}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-normal text-gray-500">费用</Label>
            <Input
              value={draft.cost}
              onChange={(e) => set("cost", e.target.value)}
              placeholder="¥ 1200"
              inputMode="decimal"
              className="h-8"
            />
            {/* 别让人以为填了就存下了 —— 这一格目前是占位 */}
            <p className="text-xs text-gray-400">
              费用暂时只留在这一格里，不进数据库，保存后刷新就没了。
            </p>
          </div>

          <p className="text-xs text-gray-400">
            入住日到退房日自动挂的那些酒店地点不会跟着改，需要的话自己到行程里调整。
          </p>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => {
                setDraft(toDraft(hotel)); // 放弃这次改动
                setExpanded(false);
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-orange-500 hover:bg-orange-600"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
