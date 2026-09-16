"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn, formatCurrency, sameFields } from "@/lib/utils";
import { formatDateStringDisplay } from "@/lib/date-helpers";
import { useBookings } from "@/context/bookings-context";
import { useExpenses } from "@/context/expenses-context";
import { usePlaces } from "@/context/places-context";
import { inferFromFlight } from "@/lib/expense-helpers";
import { Label } from "@/components/ui/label";
import FlightFormFields, {
  toDraft,
  validateDraft,
  type FlightDraft,
} from "./FlightFormFields";
import LinkedExpenseButton from "./LinkedExpenseButton";
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
  const { expenses } = useExpenses();

  /** 费用那一格的名称/类别（点「添加费用」时预填），金额本身不在这里 */
  const expenseSeed = inferFromFlight(flight);

  /** 收起态要显示的那个金额。查两遍是故意的：展开后同一个数在费用格里还有一个。 */
  const linkedExpense = expenses.find(
    (e) => e.linkedItemType === "flight" && e.linkedItemId === flight.id,
  );

  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  // 整个表单放在一个 draft 对象里，不是一个字段一个 useState
  const [draft, setDraft] = useState<FlightDraft>(() => toDraft(flight));

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
   * 那条也不受影响 —— 收起改的是 expanded，`flight` 压根没动。）
   */
  useEffect(() => {
    setDraft((prev) => {
      const next = toDraft(flight);
      return sameFields(prev, next) ? prev : next;
    });
  }, [flight]);

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
    } catch (err) {
      /*
       * service action 抛错必须接住。以前这里只有 finally，于是任何一次异常
       * （Neon 那趟连接超时是常态，见 db/client.ts）都表现成"按钮没反应"：
       * 不弹提示、卡片不收起，只有控制台里一条报错。
       */
      console.error("保存航班失败:", err);
      toast.error("保存失败，请重试");
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
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase">
            {/* 航司可空（老数据和手动添加的都可能没有），别多冒出一个分隔点 */}
            {[flight.airline, flight.flightNumber].filter(Boolean).join(" · ")}
          </span>
          {/*
            收起态也看得到这笔航班的费用。
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
          <FlightFormFields
            draft={draft}
            onChange={set}
            disabled={tripDisabled}
            fallbackMonth={dateRange?.from}
          />

          {/*
            费用：金额只有费用表一个来源，这一格只是它的视图 —— 金额在别处
            （预算里）改过，这里立刻就是新数。以前它抄在表单 draft 里，
            预算是新数、卡片还是旧的，再点一次保存还会把旧值写回去。
          */}
          <div className="space-y-1">
            <Label className="text-xs font-normal text-gray-500">费用</Label>
            <LinkedExpenseButton
              linkedItemType="flight"
              linkedItemId={flight.id}
              // 名称/类别按航班推断（如「北京-上海 航班」/ 航班），日期取出发日
              prefill={{ ...expenseSeed, date: flight.date }}
            />
            <p className="text-xs text-gray-400">
              这笔账记在预算里，点开能改金额、币种、付款人和分摊；还没有就是「添加费用」。
            </p>
          </div>

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
                // 放弃这次改动，回到库里那份
                setDraft(toDraft(flight));
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
