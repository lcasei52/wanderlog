"use client";

import { useEffect, useState } from "react";
import { differenceInCalendarDays, parse } from "date-fns";
import { ArrowRight, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatCurrency, sameFields } from "@/lib/utils";
import { CardControls } from "@/components/SortableCardGroup";
import { formatDateStringDisplay } from "@/lib/date-helpers";
import { useBookings } from "@/context/bookings-context";
import { useExpenses } from "@/context/expenses-context";
import { usePlaces } from "@/context/places-context";
import { inferFromTrain } from "@/lib/expense-helpers";
import { Label } from "@/components/ui/label";
import TrainFormFields, {
  toDraft,
  validateDraft,
  type TrainDraft,
} from "./TrainFormFields";
import LinkedExpenseButton from "./LinkedExpenseButton";
import type { Train } from "@/db/schema";

/**
 * 火车卡：点一下展开成手动编辑表单（车次、两个站、两个日期、两个时刻）。
 * 拖动排序 / 删除由外层 SortableCardGroup 提供 —— 手柄和垃圾桶浮在卡片外面，
 * 卡片本身不是拖拽热区，所以卡内放输入框不会和拖动打架。
 *
 * 保存用**显式按钮**，不学 PlaceCard 的"失焦自动保存"：这里七个字段，每格失焦都发
 * 一趟到 Neon 的请求（一趟一两秒），一次写完更合适。
 *
 * 跟 FlightCard 有三处**刻意的不同**：
 *  - **车次可以空着**。用户常常先定"这天坐火车去"、车次还没挑好，所以它不像两个站名
 *    那样必填（见 TrainFormFields.validateDraft），空着就是卡片上少一行，之后补上即可；
 *  - **大字是站名、小字是城市**，跟航班正好相反。用户关心的是"从哪个站上"，
 *    城市只是补充；而航班的行程主体是城市，机场是补充。
 *  - **到达时刻旁边带「+N天」**。12306 的时刻只有 "HH:mm"，跨夜车光看两个时刻分不清
 *    是当天下午到还是第二天下午到。到达日期跟出发日期不同就标出来。
 */
export default function TrainCard({ train }: { train: Train }) {
  const { updateTrain } = useBookings();
  const { dateRange } = usePlaces();
  const { expenses } = useExpenses();

  /** 费用那一格的名称/类别（点「添加费用」时预填），金额本身不在这里 */
  const expenseSeed = inferFromTrain(train);

  /** 收起态要显示的那个金额。查两遍是故意的：展开后同一个数在费用格里还有一个。 */
  const linkedExpense = expenses.find(
    (e) => e.linkedItemType === "train" && e.linkedItemId === train.id,
  );

  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  // 整个表单放在一个 draft 对象里，不是一个字段一个 useState
  const [draft, setDraft] = useState<TrainDraft>(() => toDraft(train));

  const tripDisabled =
    dateRange?.from && dateRange?.to
      ? { before: dateRange.from, after: dateRange.to }
      : undefined;

  /*
   * 源头那行的**字段**变了就把草稿拉回来 —— 撤销会把它换成快照里那个对象，不跟着走
   * 的话展开的卡片显示的是撤销前的值，点保存还会把撤掉的值写回库。
   *
   * 比的是字段不是对象身份：拖动排序会为了写回 position 把整列的行对象重建一遍，
   * 那种"换了对象但字段没变"不该把用户还没保存的输入擦掉。
   */
  useEffect(() => {
    setDraft((prev) => {
      const next = toDraft(train);
      return sameFields(prev, next) ? prev : next;
    });
  }, [train]);

  const set = <K extends keyof TrainDraft>(key: K, value: TrainDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    const missing = validateDraft(draft);
    if (missing) {
      toast.error(`请填写${missing}`);
      return;
    }

    setSaving(true);
    try {
      const row = await updateTrain(train.id, {
        trainNumber: draft.trainNumber.trim(),
        fromStation: draft.fromStation.trim(),
        // 城市可空：只打了站名、没走高德联想的就没有城市，空串要落成 null 而不是 ""
        fromCity: draft.fromCity.trim() || null,
        toStation: draft.toStation.trim(),
        toCity: draft.toCity.trim() || null,
        date: draft.date,
        departureTime: draft.departureTime,
        arrivalDate: draft.arrivalDate,
        arrivalTime: draft.arrivalTime,
      });
      if (!row) {
        toast.error("保存失败，请重试");
        return;
      }
      setDraft(toDraft(row)); // 以入库后的整行为准回填
      setExpanded(false);
      toast.success("火车已更新");
    } catch (err) {
      // service action 抛错必须接住，否则表现成"按钮没反应"（同 FlightCard）
      console.error("保存火车失败:", err);
      toast.error("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  // 手填的火车可以没有时刻，空的那部分整段不渲染（否则会出现「9月24日 • —」）
  const times = [train.departureTime, train.arrivalTime]
    .filter(Boolean)
    .join(" — ");

  /**
   * 到达比出发晚几天。走 date-fns 的 parse + differenceInCalendarDays，
   * **不用 `new Date(str)`**：那是按 UTC 午夜解析的，时区一偏就整天错位
   * （同 FormFields 里 DateField 上的注释）。两端用同一个解析方式，算出来的差是对的。
   */
  const dayOffset =
    train.arrivalDate && train.arrivalDate !== train.date
      ? differenceInCalendarDays(
          parse(train.arrivalDate, "yyyy-MM-dd", new Date()),
          parse(train.date, "yyyy-MM-dd", new Date()),
        )
      : 0;

  return (
    // relative：展开时那三个触摸按钮（CardControls）绝对定位到这张卡的右上角，
    // 得有个定位参照。p-3（12px）只在手机上：外面还裹着 ListShell 的 px-3，
    // 卡内再留 16px 在 375px 上就明显了。lg 以上回到 p-4。
    <Card className="relative bg-gray-50 p-3 border-0 lg:p-4">
      {/*
        头部 = 折叠态摘要，整块可点开/收起。
        展开的表单是它的**兄弟节点**而不是子节点 —— role="button" 里不能套输入框。
        收起时不重置 draft：手滑点掉卡片不该丢输入。
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
        {/*
          见 FlightCard 同一行的说明：触摸上给右上角那三个按钮让出 76px（pr-18）；
          items-start 而不是 items-center —— 城市名可空，两边高度常常不等，
          居中对齐会让两个站名不在同一条线上（这就是"内容没对齐"）；箭头因此要
          自己 mt-1 落到大字的中线上（text-lg 行高 28px 的中线 14px − 箭头 20px/2）。
          行尾那个折叠箭头已按用户要求删掉，同 FlightCard。
        */}
        <div className="flex items-start gap-4 pointer-coarse:pr-18">
          {/* 上车站：大字是站名，小字是城市 */}
          <div>
            <div className="text-lg font-bold text-gray-900">
              {train.fromStation}
            </div>
            {train.fromCity && (
              <div className="text-sm text-gray-500">{train.fromCity}</div>
            )}
          </div>

          <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-gray-400" />

          {/* 下车站 */}
          <div>
            <div className="text-lg font-bold text-gray-900">
              {train.toStation}
            </div>
            {train.toCity && (
              <div className="text-sm text-gray-500">{train.toCity}</div>
            )}
          </div>
        </div>

        {/* 日期和两个时刻 */}
        <div className="mt-3 text-sm text-gray-700">
          {/* 日期显示统一走这个 helper，别在火车卡里另写一套（它的 UTC 解析隐患在国内是对的） */}
          {formatDateStringDisplay(train.date)}
          {times && <> • {times}</>}
          {/* 跨夜车：不说清楚的话，两个 "HH:mm" 分不清是当天到还是次日到 */}
          {dayOffset > 0 && (
            <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[11px] font-semibold text-amber-700">
              +{dayOffset}天
            </span>
          )}
        </div>
        {/*
          车次可以还没定（空串）—— 那一行就整体不渲染，不留空行；有费用时照样在
          （金额得靠这一行才浮到右边）。条件写成显式的 !==：`train.trainNumber ||
          linkedExpense` 在 JSX 里的类型是 `string | Expense`，对象那一支不是 ReactNode。
        */}
        {(train.trainNumber !== "" || linkedExpense !== undefined) && (
          <div className="mt-1 flex items-center gap-2">
            {train.trainNumber && (
              <span className="text-xs text-gray-500 uppercase">
                {train.trainNumber}
              </span>
            )}
            {/*
              收起态也看得到这笔费用。
              做成纯 span 不是按钮：这一整块已经是 role="button"（点了展开），里面
              再套一个可点元素会变成"点一下既展开又弹窗"。要改金额就展开点那个蓝框。
            */}
            {linkedExpense && (
              <span className="ml-auto shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-600">
                {formatCurrency(linkedExpense.amount, linkedExpense.currency)}
              </span>
            )}
          </div>
        )}
      </div>

      {/*
        触摸上那三个按钮（▲ ▼ 🗑）：只在展开时出现，绝对定位落在卡片右上角
        （参照物是上面 Card 那个 relative）。★ 必须挂在展开区外面，理由见下。
      */}
      {expanded && <CardControls className="right-1 top-1" />}

      {/*
        contain-inline-size：展开区不参与卡片宽度的计算，点开卡片不会把整个正文列
        顶宽、把地图挤窄。机制（左列在 lg 上是 max-content 撑出来的）、为什么展开区
        天生更宽（<input> 的固有宽度、两列 grid、truncate 的日期串）、以及为什么那
        三个按钮必须留在这个盒子**外面**，见 FlightCard 同一处的长注释。

        ★ 航班/住宿/火车三张卡是同一处，改一张就瞄一眼另外两张。
      */}
      {expanded && (
        <div className="contain-inline-size mt-3 pt-3 border-t border-gray-200 space-y-3">

          {/*
            这里**不传 onStationPick**：改站名不会回头动那两张站点卡（也不重查 12306），
            跟"改航班不会动机场卡"是同一条规矩。传了反而会让人以为能联动。
          */}
          <TrainFormFields
            draft={draft}
            onChange={set}
            disabled={tripDisabled}
            fallbackMonth={dateRange?.from}
          />

          {/*
            费用：金额只有费用表一个来源，这一格只是它的视图 —— 金额在别处
            （预算里）改过，这里立刻就是新数。
          */}
          <div className="space-y-1">
            <Label className="text-xs font-normal text-gray-500">费用</Label>
            <LinkedExpenseButton
              linkedItemType="train"
              linkedItemId={train.id}
              // 名称/类别按火车推断（如「宜昌北站-武汉站 G1030」/ 公共交通），日期取乘车日
              prefill={{ ...expenseSeed, date: train.date }}
            />
            <p className="text-xs text-gray-400">
              这笔账记在预算里，点开能改金额、币种、付款人和分摊；还没有就是「添加费用」。
            </p>
          </div>

          <p className="text-xs text-gray-400">
            上车站/下车站那两张地点卡不会跟着改，需要的话自己到行程里调整。
          </p>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => {
                // 放弃这次改动，回到库里那份
                setDraft(toDraft(train));
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
