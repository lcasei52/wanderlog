"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { ImagePlus, Calendar as CalendarIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { TripSummary } from "@/types/trip";
import { usePlaces } from "@/context/places-context";
import { useExpenses } from "@/context/expenses-context";
import { useHistory } from "@/context/history-context";
import { updateTripCover } from "@/actions/trip-cover";
import ImagePickerDialog from "@/components/ImagePickerDialog";
import TripHeaderCard from "./TripHeaderCard";
import BookingCard from "./overview/BookingCard";
import BudgetSummaryCard from "./overview/BudgetSummaryCard";
import BudgetCard from "./overview/BudgetCard";
import ExpensesList from "./overview/ExpensesList";
import AddExpenseDialog from "./overview/AddExpenseDialog";
import EditExpenseDialog from "./overview/EditExpenseDialog";
import NotesList from "./overview/NotesList";
import FlightsList from "./overview/FlightsList";
import HotelsList from "./overview/HotelsList";
import TrainsList from "./overview/TrainsList";
import PlacesList from "./overview/PlacesList";
import ListDivider from "./overview/ListDivider";
import DayCard from "./itinerary/DayCard";

interface DetailContentProps {
  /** 来自数据库的行程快照 */
  trip?: TripSummary;
  /** 滚动位置变化时上报：当前所在的大类 id（overview/itinerary/budget）与小标题锚点 id */
  onActiveChange?: (active: { section: string; subId: string | null }) => void;
}

export default function DetailContent({
  trip,
  onActiveChange,
}: DetailContentProps) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  const lastActiveKeyRef = useRef("");

  // 概览 / 行程 / 日期统一由 PlacesProvider + BookingsProvider 供给
  const {
    items,
    placeLists,
    days,
    dateRange,
    setDateRange,
    addPlaceList,
    reorderPlaceLists,
  } = usePlaces();
  const { getExpense } = useExpenses();
  const { batch } = useHistory();

  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);

  /*
   * 正在编辑的那笔费用（「＋ 添加费用」里挑到已记账的项目时会切到它）；null = 关着。
   * 存 id 不存那一行的对象，理由和 ExpensesList 里那处一样：撤销会把费用表换成快照
   * 里那份对象，攥着旧对象的话弹窗永远看不到源头变了，点保存就把撤掉的值写回库。
   */
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const editingExpense = editingExpenseId
    ? (getExpense(editingExpenseId) ?? null)
    : null;

  // 撤销可能正好把这笔费用收走 —— 那就等于关掉弹窗，别留着 id 等它被复原时自己弹开
  useEffect(() => {
    if (editingExpenseId && !getExpense(editingExpenseId)) {
      setEditingExpenseId(null);
    }
  }, [editingExpenseId, getExpense]);

  /**
   * scrollspy：取滚动容器内一条"参考线"（顶部往下 140px），
   * 看它落在哪个大节(section)、再落在该节里的哪个小标题(list/day)上。
   * 参考线还停在最上方封面区时，兜底算概览。
   */
  const computeActive = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;
    const line = root.getBoundingClientRect().top + 140;
    const topOf = (id: string) =>
      document.getElementById(id)?.getBoundingClientRect().top ?? Infinity;

    // 大类：最后一个顶线已越过参考线的 section（内容按 overview→itinerary→budget 排）
    const sectionIds = ["overview", "itinerary", "budget"];
    let section: string | null = null;
    for (const s of sectionIds) {
      if (topOf(s) <= line) section = s;
    }
    if (!section) section = "overview"; // 顶部封面/头部还没到 overview 顶线时也算概览

    /*
     * 滚到底了就直接认最后一节，这是**必须**的补丁而不是兜底：
     * 参考线是"顶部往下 140px"，而最后那一节底下根本没有那么高的内容可滚 ——
     * 预算那节（预算卡 + 费用列表）撑不满"视口高度 - 140px"时，budget 的顶线永远
     * 越不过参考线，于是整页滚到底侧栏还停在"行程"上，看起来就是"高亮没对齐"。
     * 到底了 = 一定在读最后一节，这一条比参考线更可靠。
     *
     * scrollable 那个前置判断不能省：内容一屏装得下时 scrollTop 恒为 0，
     * 不判的话任何短行程一进页面就会被判成"已在底部"，直接点亮预算。
     * 两个 -2 是给亚像素留的余量（这几个值都可能是小数）。
     */
    const scrollable = root.scrollHeight > root.clientHeight + 2;
    const atBottom =
      scrollable && root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
    if (atBottom) section = sectionIds[sectionIds.length - 1];

    // 小标题：只在该大类内找（概览=list 锚点，行程=day 锚点；预算没有比它自己更细的锚点，
    // 侧栏那条「查看」指的就是 budget 本身，所以这里不出 subId）
    const subIds =
      section === "overview"
        ? [
            "list-notes",
            "list-flights",
            // 火车列表为空时这一节整个不在 DOM 里，topOf 对它回 Infinity，
            // 参与循环无害（永远不会被选中）
            "list-trains",
            "list-hotels",
            ...placeLists.map((l) => `list-${l.id}`),
          ]
        : section === "itinerary"
          ? days.map((d) => `day-${d.dayDate}`)
          : [];

    let subId: string | null = null;
    let bestTop = -Infinity;
    for (const id of subIds) {
      const top = topOf(id);
      if (top <= line && top > bestTop) {
        bestTop = top;
        subId = id;
      }
    }

    const key = `${section}||${subId ?? ""}`;
    if (key !== lastActiveKeyRef.current) {
      lastActiveKeyRef.current = key;
      onActiveChangeRef.current?.({ section, subId });
    }
    // items 参与依赖：增删地点会改变各块高度，需在渲染后即时重算当前位置
  }, [placeLists, days, items]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        computeActive();
      });
    };
    computeActive();
    root.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    // 侧边栏展开/收起时窗口尺寸没变（window.resize 不触发），但这一列在变宽，
    // 正文重新折行 → 各锚点 top 全变，参考线扫到的 section/subId 可能已经过期。
    // 所以还要盯容器自身的尺寸；和 scroll 复用同一个 schedule（内部 rAF 合并），
    // 动画期间每帧最多算一次，且读写都在观察者回调之外，不会触发
    // "ResizeObserver loop completed with undelivered notifications"。
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => schedule());
    ro?.observe(root);

    return () => {
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      root.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [computeActive]);

  const handleImageChange = () => setShowImagePicker(true);

  /**
   * 在概览这一列里，第 index 个地点列表**之前**插一个新列表
   * （index = placeLists.length 就是插在最后一个之后）。
   *
   * 两步：先按常规新增（服务端新行 position = 当前最大 + 1，也就是挂在最后），
   * 再把整列顺序重写成"原顺序 + 新列表插在第 index 位" —— reorderPlaceLists 会把
   * 整列的 position 重排成 0..n-1，正好落在用户点的那条缝里。
   *
   * 这跟 PlacesList.handleGapAdd 是同一套路（那边是"在这儿插一个地点"），
   * 区别只是列表少一层容器、重排要动整列。同样包进 batch：用户眼里这是**一个**动作，
   * 不包的话撤销栈会记两份快照，要按两下才退回去。
   */
  const insertListAt = async (index: number) => {
    await batch(async () => {
      const row = await addPlaceList();
      if (!row) return;
      const ids = placeLists.map((l) => l.id);
      await reorderPlaceLists([
        ...ids.slice(0, index),
        row.id,
        ...ids.slice(index),
      ]);
    });
  };

  const handleImageSelect = async (result: { url?: string; data?: string }) => {
    if (!trip?.id) return;
    try {
      await updateTripCover(trip.id, result);
      toast.success("封面已更新");
      router.refresh();
      setShowImagePicker(false);
    } catch (error) {
      toast.error("更新失败，请重试");
      console.error("Failed to update cover:", error);
    }
  };

  return (
    /*
      scrollbar-gutter-stable：侧边栏展开/收起时这一列宽度在变，正文可能在触发
      滚动条的临界点上来回跨一次；不预留槽位会在动画中途多出约 17px 的二次跳动。
    */
    <div
      ref={contentRef}
      className="flex-1 overflow-y-auto bg-gray-50 scrollbar-gutter-stable"
    >
      {/* 背景图区域 */}
      <div className="relative h-64 w-full">
        {trip?.coverImageUrl || trip?.coverImageData ? (
          <Image
            src={trip.coverImageUrl || trip.coverImageData!}
            alt={trip.name}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-400 to-pink-400" />
        )}

        {/* 右上角：更换图片按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/40 hover:bg-black/60 text-white z-10"
          onClick={handleImageChange}
          title="更换封面图片"
        >
          <ImagePlus className="h-5 w-5" />
        </Button>
      </div>

      {/*
        标题卡：骑在封面下沿上（一半压着图、一半露在下面）。

        ★ 它是**正常流**里的一块，靠 -mt-19 往上提半个卡高，不再是
        `absolute bottom-0 translate-y-1/2`。区别就在"流里有没有它"：

        卡高（一行标题）是 24 + 40(标题行高) + 16(mb-4) + 16(Card 的 flex gap)
        + 32(那一行) + 24 = 152px，一半 76px 正好是 -mt-19。以前它 absolute 跑出
        封面之外，正常流当它不存在，于是下面那块内容只能靠一个写死的 mt-24 去躲
        —— 96px 恰好等于"一行标题 76 + 净空 20"，行程名一折行卡就变 192 高、露出去
        96，一分不差地贴上（用户报的"和上面的卡片挨着了"就是这个）。

        现在卡的高度真的算进页面高度：折几行都只会把下面顶下去，不会压上去。

        ★ 它必须是封面那个 div 的**兄弟**，不能塞进去：封面是写死的 h-64，塞进去
        的话它是封面里唯一的流内元素、会从封面**顶端**开始排（-mt-19 反倒把它提到
        封面上面去），而且高度再多也撑不动那个 h-64。

        relative z-10：封面图是 absolute 的，绝对定位的画在正常流之后，不显式抬
        一下卡片会被图盖住。（-mt-19 是负外边距，卡片自己还看得见。）
      */}
      <div className="relative z-10 -mt-19 px-6">
        <TripHeaderCard
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          initialTitle={trip?.name}
          tripId={trip?.id}
        />
      </div>

      {/*
        内容区域 - 顶部那点空档。

        mt-6 只是"标题卡下沿 → 概览那两个卡"之间的净空，**不是**用来躲标题卡的：
        标题卡已经在正常流里，多高的标题都会把这一整块顶下去（见上面那段）。以前那
        个 mt-24 才是躲卡的，也正是它被折行的标题吃干净、露出"贴住"的毛病。

        px-2（8px）：手机上这一层是全页最外侧的留白，多留 8px，底下每一层再各留一点，
        加起来整张卡就离屏边很远了（概览那条链是 页面 8 + ListShell 40 + 卡片 8）。
        lg 以上回到 px-6 —— 桌面宽度不缺这点，别动。
      */}
      <div className="mt-6 px-2 pb-8 space-y-8 lg:px-6">
        {/* 概览 */}
        <section id="overview" className="scroll-mt-4">
          {/*
            顶部两个卡片：**任何宽度都是同一行**，2/3 给「预订和附件」、1/3 给预算摘要。

            以前 lg 以下是单列堆叠的（grid-cols-1 lg:grid-cols-3），理由是"列太窄，
            两张卡的内容会挤"。用户要的还是原来那个结构（一行、一个 2/3 一个 1/3），
            所以列数固定成 3，两个 span 也不带 lg: 前缀了。

            窄屏的代价落在两张卡自己身上：375px 上 2/3 那格只有 234px、1/3 只有 109px，
            所以它们在 sm 以下横向各收到 12（px-3）。预订卡里六个图标也因此只能**挤成
            一行**（窄屏去掉按钮内边距、收紧字距）—— 一折行这张卡就变高，而两张卡共用
            行高，等于把右边那张一起顶高。
            ★ 那几处和这里是**一对**：动这一行的比例，就跟着看那两张卡的窄屏尺寸，
            反过来也一样。
          */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="col-span-2">
              <BookingCard />
            </div>
            <div className="col-span-1">
              {/* 摘要卡：详细的那张在「预算」大标题下，这里点「查看详情」滚过去 */}
              <BudgetSummaryCard budgetCurrency={trip?.budgetCurrency} />
            </div>
          </div>

          {/*
            列表区：Notes / Flights / Trains / Hotels / 各地点列表 / + 新列表
            （火车那一节在没火车时整个不渲染，所以这行"多出来的"在没火车时
             看不见，跟侧栏把它当条件项一致）
          */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {/*
              固定那几节（笔记/航班/火车/住宿）自己裹一层，边界仍旧交给 divide-y 画 ——
              divide-y 只给**有 DOM 的相邻兄弟**画线，火车列表为空时 TrainsList 整个
              不渲染，这一节就自然少一条线。没火车时它就变成"笔记/航班/住宿"三节，
              左边这几行也是这样理解它的。

              下面各地点列表**不能**跟它们挤在同一个 divide-y 里：每个地点列表前面
              要挂一条**自己带 + **的分隔线（ListDivider 用 h-px 画线），再叠一层
              divide-y 就是两条线贴在一起、看着像 2px 的粗边。
            */}
            <div className="divide-y divide-gray-100">
              <NotesList />
              <FlightsList />
              <TrainsList />
              <HotelsList />
            </div>

            {placeLists.map((list, index) => (
              // Fragment 带 key：分隔线和它下面那个列表是一对，key 挂在 Fragment 上
              // （挂在里面任何一个上都会变成"列表重建、分隔线复用"那种错位的 diff）
              <Fragment key={list.id}>
                {/* 这条 + 是"插在**这个**列表前面"，所以索引就是它自己的下标 */}
                <ListDivider onAdd={() => insertListAt(index)} />
                <PlacesList list={list} />
              </Fragment>
            ))}

            {/* 收尾的一条普通分隔线。这里不挂 +：紧跟着的「+ 新列表」干的是同一件事 */}
            <ListDivider />

            {/*
              「+ 新列表」是这一列的**最后一行**，不是卡片外面那个通栏橙按钮：
              放在里面它才在卡片里、上面那条线由 ListDivider 画，左沿也能跟各列表的
              内容对齐。

              px 抄的就是 ListShell 的内容区（那边是同一个数，lg 前后各一套）——
              于是这一行跟行程里 DayCard 的「+ 添加地点」落在同一条竖线上。两处本来就是
              同一件事（在这儿再加一条），长得也该一样：浅灰字、无内边距，点一下才变深。

              ★ 这是一对数：ListShell 那两处内边距（标题行 px、内容区 px/pl）和这里必须
              同进同退，改成 px-3 就得三处一起改，否则"新列表"会跟上面各列表的内容错开
              一条。同一条竖线上还有 ListDivider 的 left-1（12px 处那个 + 号）。
            */}
            <div className="px-3 py-5 lg:px-6 lg:pl-14">
              <Button
                variant="link"
                onClick={() => addPlaceList()}
                className="h-auto p-0 text-sm text-gray-400 hover:text-gray-600"
              >
                + 新列表
              </Button>
            </div>
          </div>
        </section>

        {/* 行程 */}
        <section id="itinerary" className="scroll-mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-4xl font-bold text-gray-900 px-2">行程</h2>
            {/* 日期修改按钮 */}
            <Popover>
              <PopoverTrigger asChild>
                {/*
                  浅灰底、无边框的一块，底色跟 PlaceCard 用同一个 bg-gray-100 ——
                  它在页面上跟卡片是同一层的"内容块"，描边按钮摆在这儿比卡片还重。
                  outline 那套描边/hover 由 className 覆盖掉（cn 里调用方写在最后，
                  tailwind-merge 按同一组取后者）。

                  aria-expanded:bg-gray-200 是**必须**写的：outline 变体自带一条
                  aria-expanded:bg-muted，而 Radix 会在弹出日历的瞬间给这个按钮加上
                  aria-expanded —— 不写的话"打开着"这个状态会跟到 --muted 上去
                  （那个 token 是 oklch(0.97)，跟 gray-100 肉眼几乎一样，于是打开时
                  底色莫名换了一档）。钉成 gray-200，跟 hover 是同一档，读作"按着呢"。
                */}
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 border-0 bg-gray-100 font-medium text-gray-700 hover:bg-gray-200 hover:text-gray-900 aria-expanded:bg-gray-200 aria-expanded:text-gray-900"
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
            {days.map((day) => (
              // id 供侧边栏"行程"小标题滚动与 scrollspy 定位（与大标题同规格的锚点）
              <div
                key={day.dayDate}
                id={`day-${day.dayDate}`}
                className="scroll-mt-4"
              >
                <DayCard day={day} />
              </div>
            ))}
          </div>
        </section>

        {/* 预算 */}
        <section id="budget" className="scroll-mt-4">
          {/* 「预算」标题与「＋ 添加费用」同一行，按钮靠最右 */}
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-4xl font-bold text-gray-900 px-2">预算</h2>
            <Button
              className="rounded-full bg-orange-500 px-5 hover:bg-orange-600"
              onClick={() => setShowAddExpense(true)}
            >
              <Plus className="size-4 " strokeWidth={3} />
              <span className="font-semibold">添加费用</span>
            </Button>
          </div>

          <div className="space-y-4">
            {/* 详细预算卡：当前总额 + 进度条 + 团队情况 + 右侧三个入口 */}
            <BudgetCard
              tripId={trip?.id ?? ""}
              budget={trip?.budget}
              budgetCurrency={trip?.budgetCurrency}
            />

            {/* 费用明细 */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <ExpensesList />
            </div>
          </div>
        </section>
      </div>

      {/* 添加费用弹窗（「＋ 添加费用」按钮打开） */}
      <AddExpenseDialog
        open={showAddExpense}
        onOpenChange={setShowAddExpense}
        /*
         * 在「选择项目」里挑到一个已经记过账的项目（比如某天的某个地点）时，
         * 不是"再记一笔"而是"改那一笔"—— 换成费用列表用的那个编辑框。
         */
        onEditExisting={(expense) => setEditingExpenseId(expense.id)}
      />

      {/* 编辑费用：从上面那个框里挑到已记账的项目时接手 */}
      <EditExpenseDialog
        expense={editingExpense}
        onOpenChange={(open) => !open && setEditingExpenseId(null)}
      />

      {/* 图片选择器弹窗 */}
      <ImagePickerDialog
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelect={handleImageSelect}
        searchQuery={trip?.destination?.name}
        subject="行程封面"
      />
    </div>
  );
}
