"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import PlacesList from "./overview/PlacesList";
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
  const { items, placeLists, days, dateRange, setDateRange, addPlaceList } =
    usePlaces();
  const { getExpense } = useExpenses();

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

    // 小标题：只在该大类内找（概览=list 锚点，行程=day 锚点，预算无小标题）
    const subIds =
      section === "overview"
        ? [
            "list-notes",
            "list-flights",
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

        {/* 悬浮卡片 */}
        <div className="absolute inset-x-0 bottom-0 translate-y-1/2 px-6 z-10">
          <TripHeaderCard
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            initialTitle={trip?.name}
          />
        </div>
      </div>

      {/* 内容区域 - 给顶部留出空间 */}
      <div className="mt-24 px-6 pb-8 space-y-8">
        {/* 概览 */}
        <section id="overview" className="scroll-mt-4">
          <h2 className="text-2xl font-bold mb-4 text-gray-900">概览</h2>

          {/* 顶部两个卡片 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="col-span-2">
              <BookingCard />
            </div>
            <div className="col-span-1">
              {/* 摘要卡：详细的那张在「预算」大标题下，这里点「查看详情」滚过去 */}
              <BudgetSummaryCard budgetCurrency={trip?.budgetCurrency} />
            </div>
          </div>

          {/* 列表区：Notes / Flights / Hotels / 各地点列表 */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden divide-y divide-gray-100">
            <NotesList />
            <FlightsList />
            <HotelsList />
            {placeLists.map((list) => (
              <PlacesList key={list.id} list={list} />
            ))}
          </div>

          {/* 新建列表按钮 */}
          <Button
            variant="link"
            onClick={() => addPlaceList()}
            className="w-full mt-4 py-3 text-orange-600 hover:text-orange-700 font-medium h-auto"
          >
            + 新列表
          </Button>
        </section>

        {/* 行程 */}
        <section id="itinerary" className="scroll-mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">行程</h2>
            {/* 日期修改按钮 */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
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
              <div key={day.dayDate} id={`day-${day.dayDate}`} className="scroll-mt-4">
                <DayCard day={day} />
              </div>
            ))}
          </div>
        </section>

        {/* 预算 */}
        <section id="budget" className="scroll-mt-4">
          {/* 「预算」标题与「＋ 添加费用」同一行，按钮靠最右 */}
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-2xl font-bold text-gray-900">预算</h2>
            <Button
              className="rounded-full bg-orange-500 px-5 hover:bg-orange-600"
              onClick={() => setShowAddExpense(true)}
            >
              <Plus className="size-4" />
              添加费用
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
