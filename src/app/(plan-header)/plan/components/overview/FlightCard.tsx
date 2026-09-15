"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDateStringDisplay } from "@/lib/date-helpers";
import { useBookings } from "@/context/bookings-context";
import { usePlaces } from "@/context/places-context";
import FlightFormFields, {
  toDraft,
  validateDraft,
  type FlightDraft,
} from "./FlightFormFields";
import type { Flight } from "@/db/schema";

/**
 * 航班卡：点一下展开成手动编辑表单（航班号/航司/出发到达的城市·机场·日期·时刻）。
 * 拖动排序 / 删除由外层 SortableCardGroup 提供 —— 手柄和垃圾桶浮在卡片外面，
 * 卡片本身不是拖拽热区，所以卡内放输入框不会和拖动打架。
 *
 * 保存用**显式按钮**，不学 PlaceCard 的"失焦自动保存"：这里十个字段，
 * 每格失焦都发一趟到 Neon 的请求（一趟一两秒），一次写完更合适。
 */
export default function FlightCard({ flight }: { flight: Flight }) {
  const { updateFlight } = useBookings();
  const { dateRange } = usePlaces();

  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  // 整个表单放在一个 draft 对象里，不是一个字段一个 useState
  const [draft, setDraft] = useState<FlightDraft>(() => toDraft(flight));

  const tripDisabled =
    dateRange?.from && dateRange?.to
      ? { before: dateRange.from, after: dateRange.to }
      : undefined;

  const set = <K extends keyof FlightDraft>(key: K, value: FlightDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    const missing = validateDraft(draft);
    if (missing) {
      toast.error(`请填写${missing}`);
      return;
    }

    setSaving(true);
    try {
      const row = await updateFlight(flight.id, {
        flightNumber: draft.flightNumber.trim(),
        airline: draft.airline.trim() || null,
        from: draft.from.trim(),
        fromCity: draft.fromCity.trim(),
        fromCode: draft.fromCode.trim(),
        date: draft.date,
        departureTime: draft.departureTime,
        to: draft.to.trim(),
        toCity: draft.toCity.trim(),
        toCode: draft.toCode.trim(),
        arrivalDate: draft.arrivalDate,
        arrivalTime: draft.arrivalTime,
      });
      if (!row) {
        toast.error("保存失败，请重试");
        return;
      }
      setDraft(toDraft(row)); // 以入库后的整行为准回填
      setExpanded(false);
      toast.success("航班已更新");
    } finally {
      setSaving(false);
    }
  };

  // 手动添加的航班可以没有机场名和时刻，空的那部分整段不渲染
  // （否则会出现「9月24日 • —」这种，或者一行空白的机场行）
  const times = [flight.departureTime, flight.arrivalTime]
    .filter(Boolean)
    .join(" — ");

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
        <div className="flex items-center gap-4">
          {/* 出发地 */}
          <div>
            <div className="text-lg font-bold text-gray-900">{flight.from}</div>
            {flight.fromCity && (
              <div className="text-sm text-gray-500">{flight.fromCity}</div>
            )}
          </div>

          {/* 箭头 */}
          <ArrowRight className="h-5 w-5 shrink-0 text-gray-400" />

          {/* 目的地 */}
          <div>
            <div className="text-lg font-bold text-gray-900">{flight.to}</div>
            {flight.toCity && (
              <div className="text-sm text-gray-500">{flight.toCity}</div>
            )}
          </div>

          <ChevronDown
            className={cn(
              "ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform motion-reduce:transition-none",
              expanded && "rotate-180"
            )}
          />
        </div>

        {/* 时间和航班号 */}
        <div className="mt-3 text-sm text-gray-700">
          {formatDateStringDisplay(flight.date)}
          {times && <> • {times}</>}
        </div>
        <div className="text-xs text-gray-500 mt-1 uppercase">
          {/* 航司可空（老数据和手动添加的都可能没有），别多冒出一个分隔点 */}
          {[flight.airline, flight.flightNumber].filter(Boolean).join(" · ")}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
          <FlightFormFields
            draft={draft}
            onChange={set}
            disabled={tripDisabled}
            fallbackMonth={dateRange?.from}
          />

          <p className="text-xs text-gray-400">
            出发/到达机场在当天列表里那两条地点不会跟着改，需要的话自己到行程里调整。
          </p>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => {
                setDraft(toDraft(flight)); // 放弃这次改动
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
