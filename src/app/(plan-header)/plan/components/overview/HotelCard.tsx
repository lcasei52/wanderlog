"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { parse, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn, formatCurrency, sameFields } from "@/lib/utils";
import { formatDateStringDisplay } from "@/lib/date-helpers";
import { useBookings } from "@/context/bookings-context";
import { usePlaces } from "@/context/places-context";
import { useExpenses } from "@/context/expenses-context";
import DateRangeField from "./DateRangeField";
import LinkedExpenseButton from "./LinkedExpenseButton";
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
}

function toDraft(h: Hotel): HotelDraft {
  return {
    name: h.name,
    address: h.address ?? "",
    checkIn: h.checkIn,
    checkOut: h.checkOut,
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
  const { expenses } = useExpenses();

  /** 收起态要显示的那个金额。查两遍是故意的：展开后同一个数在费用格里还有一个。 */
  const linkedExpense = expenses.find(
    (e) => e.linkedItemType === "hotel" && e.linkedItemId === hotel.id,
  );

  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<HotelDraft>(() => toDraft(hotel));

  const tripDisabled =
    dateRange?.from && dateRange?.to
      ? { before: dateRange.from, after: dateRange.to }
      : undefined;

  /*
   * 源头那行的**字段**变了就把草稿拉回来 —— 撤销会把它换成快照里那个对象，不跟着走
   * 的话展开的卡片显示的是撤销前的值，点保存还会把撤掉的值写回库。
   *
   * 比的是字段不是对象身份：拖动排序会为了写回 position 把整列的行对象重建一遍，
   * 那种"换了对象但字段没变"不该把用户还没保存的输入擦掉。（收起卡片不重置 draft
   * 那条也不受影响 —— 收起改的是 expanded，`hotel` 压根没动。）
   */
  useEffect(() => {
    setDraft((prev) => {
      const next = toDraft(hotel);
      return sameFields(prev, next) ? prev : next;
    });
  }, [hotel]);

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
    } catch (err) {
      /*
       * service action 抛错必须接住。以前这里只有 finally，于是任何一次异常
       * （Neon 那趟连接超时是常态，见 db/client.ts）都表现成"按钮没反应"：
       * 不弹提示、卡片不收起，只有控制台里一条报错。
       */
      console.error("保存住宿失败:", err);
      toast.error("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-gray-50 p-4 border-0">
      {/*
        头部 = 折叠态摘要，整块可点开/收起。
        展开的表单是它的**兄弟节点**而不是子节点 —— role="button" 里不能套输入框。
        收起时不重置 draft：手滑点掉卡片不该丢输入。重置只有三个来源：保存、取消、
        以及上面那个 effect（源头那行真的变了）。
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

        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-gray-700">
            {formatDateStringDisplay(hotel.checkIn)} —{" "}
            {formatDateStringDisplay(hotel.checkOut)}
          </span>
          {/*
            收起态也看得到这笔住宿的费用。
            做成纯 span 不是按钮：这一整块已经是 role="button"（点了展开），里面
            再套一个可点元素会变成"点一下既展开又弹窗"。要改金额就展开点那个蓝框。
          */}
          {linkedExpense && (
            <span className="ml-auto shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-600">
              {formatCurrency(linkedExpense.amount, linkedExpense.currency)}
            </span>
          )}
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

          {/*
            费用：金额只有费用表一个来源，这一格只是它的视图 —— 金额在别处
            （预算里）改过，这里立刻就是新数。以前它抄在表单 draft 里，
            预算是新数、卡片还是旧的，再点一次保存还会把旧值写回去。
          */}
          <div className="space-y-1">
            <Label className="text-xs font-normal text-gray-500">费用</Label>
            <LinkedExpenseButton
              linkedItemType="hotel"
              linkedItemId={hotel.id}
              // 名称用酒店名，类别「住宿」，日期取入住日
              prefill={{ name: hotel.name, category: "住宿", date: hotel.checkIn }}
            />
            <p className="text-xs text-gray-400">
              这笔账记在预算里，点开能改金额、币种、付款人和分摊；还没有就是「添加费用」。
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
                // 放弃这次改动，回到库里那份
                setDraft(toDraft(hotel));
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
