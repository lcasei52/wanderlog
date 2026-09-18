"use client";

import { useEffect, useState } from "react";
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
    // relative：展开时那三个触摸按钮（CardControls）绝对定位到这张卡的右上角，
    // 得有个定位参照。p-3（12px）只在手机上：外面还裹着 ListShell 的 px-3，
    // 卡内再留 16px 在 375px 上就明显了。lg 以上回到 p-4。
    <Card className="relative bg-gray-50 p-3 border-0 lg:p-4">
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
        {/*
          这一行是卡片里**两种状态下都在最上面**的那一行，触摸上卡片右上角那三个
          按钮（▲ ▼ 🗑，见 SortableCardGroup）正好压着它的右端 —— 不留空就会被盖住。
          算一遍：按钮从卡片右沿往里 4(right-1) + 72(三个 size-6) = 76px；行内容右沿在
          12(p-3) + pr-18(72) = 84px 处，正好贴住按钮左沿、留 8px 净空。
          站名长了会折到第二行，不会顶出去。（按钮只在展开时出现，这里常留着这点空。）

          原来行尾那个 ml-auto 的折叠箭头已经删掉：箭头表示"能展开"这件事，
          而这张卡整块都是可点的、展开后内容自带一条分隔线，"能不能展开"看内容就知道。
          （火车卡、住宿卡上那个是同一个，一起删的。）

          ★ items-start 不是 items-center：这一行两块内容**高度可以不相等** ——
          城市名可空（老数据、手动加的都可能没有），于是常常是"左边两行、右边一行"。
          items-center 会按各自的高度分别垂直居中，两块的大字就不在同一条基线上了
          （用户看到的就是"内容没对齐"）。改成从顶对齐，两个大字天然齐平，
          下面那行城市名有没有都不影响。（住宿卡本来就是 items-start，所以它没这个毛病。）

          所以中间的箭头得自己往下挪：它是 items-start 之后唯一一个需要居中的东西。
          text-lg 的行高是 28px（v4 里 calc(1.75 / 1.125)），中线在 14px；箭头 h-5 是 20px，
          上边距 = 14 - 20/2 = 4px = mt-1。
        */}
        <div className="flex items-start gap-4 pointer-coarse:pr-18">
          {/* 出发地 */}
          <div>
            <div className="text-lg font-bold text-gray-900">{flight.from}</div>
            {flight.fromCity && (
              <div className="text-sm text-gray-500">{flight.fromCity}</div>
            )}
          </div>

          {/* 箭头 */}
          <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-gray-400" />

          {/* 目的地 */}
          <div>
            <div className="text-lg font-bold text-gray-900">{flight.to}</div>
            {flight.toCity && (
              <div className="text-sm text-gray-500">{flight.toCity}</div>
            )}
          </div>
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

      {/*
        触摸上那三个按钮（▲ ▼ 🗑）：只在展开时出现，绝对定位落在卡片右上角
        （参照物是上面 Card 那个 relative）。

        ★ 必须挂在展开区**外面** —— 跟下面那个 contain-inline-size 的盒子平级。
        塞进盒子里的话，那个盒子成了绝对定位的包含块（原因见下面那段），按钮就从
        "卡片右上角"掉到"展开区右上角"，压在第一行表单上。
      */}
      {expanded && <CardControls className="right-1 top-1" />}

      {/*
        ★ contain-inline-size 不是装饰，是"展开卡片不改变正文列宽度"的唯一原因。

        看 TripWorkspace 左列那行（lg:flex-initial lg:min-w-auto）：那一列的宽度是
        **内容撑出来的** —— flex: 0 auto 的基准尺寸取 max-content，min-width: auto
        又不让它缩到内容以下，而地图列只是 lg:flex-1，拿的是剩下的。于是展开区里
        只要有一样东西的固有宽度比收起态那行站名宽，整列就跟着变宽、地图被挤窄，
        收起来又缩回去 —— 表现就是"点开一张卡，整个正文列宽一下"。

        而展开区里恰好全是有固有宽度的控件：<input> 天生就有二十来个字符那么宽
        （w-full 只决定它用起来多宽，管不了它往上报的 max-content），两列 grid 把
        两份加起来；DateField 里那串日期是 truncate（nowrap），也按整串算。三样加
        起来就比收起态宽。

        contain: inline-size 让这个盒子**按"里面什么都没有"参与固有尺寸计算**：它给
        祖先报的 max-content 是 0，于是卡片宽度只由收起态那部分决定，展开内容一律按
        卡片**当时的**宽度排版。块轴不包含，高度照旧由内容撑开。

        展开内容压得下去，不会顶出去被 Card 的 overflow-hidden 切掉：输入框都是
        w-full、grid 轨道是 minmax(0,1fr)、日期串自己 truncate、说明文字是中文会折行。

        ★ 三张预订卡（航班/住宿/火车）是同一处，改一张就瞄一眼另外两张。
      */}
      {expanded && (
        <div className="contain-inline-size mt-3 pt-3 border-t border-gray-200 space-y-3">

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
