"use client";

import { useEffect, useState } from "react";
import {
  Plane,
  Car,
  Train,
  Paperclip,
  MoreHorizontal,
  Bed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookings, type BookingVariant } from "@/context/bookings-context";
import { useExpenses } from "@/context/expenses-context";
import AddExpenseDialog from "./AddExpenseDialog";
import EditExpenseDialog from "./EditExpenseDialog";

/** 滚动到对应 section 并展开（BookingCard 顶部快捷入口） */
export function scrollToSection(variant: BookingVariant): void {
  const element = document.getElementById(`list-${variant}`);
  if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * 预订和附件：航班/住宿/火车计数与展开态都从 BookingsProvider 自取。
 *
 * 「租车」跟其余几个不一样：它**没有自己的表**，所以不是一节列表、也没有计数 ——
 * 点击直接开「添加费用」并预填类别「租车」。一笔租车开销本来就是一笔费用，为它再建
 * 一张表（外加 action / 快照 / 卡片）只是把费用表已有的东西重写一遍。
 *
 * 两个弹窗由本组件自己持有，跟 LinkedExpenseButton 同一个做法（那里写明了理由：
 * 调用方只需要摆一个按钮的位置）。**不能只挂 AddExpenseDialog** —— 用户在「选择项目」
 * 里挑到一个已经记过账的项目时，AddExpenseDialog 会把它交回给 onEditExisting，
 * 少了 EditExpenseDialog 就是"选完没反应"。
 */
export default function BookingCard() {
  const { flights, hotels, trains, setExpanded, requestAdd } = useBookings();
  const { expenses, getExpense } = useExpenses();

  const [showCarRental, setShowCarRental] = useState(false);
  /*
   * 存 id 不存那一行的对象，同 DetailContent 的做法：撤销会把费用表换成快照里那份
   * 对象，攥着旧对象的话编辑框永远看不到源头变了，点保存就把撤掉的值写回库。
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

  const openSection = (variant: BookingVariant) => {
    setExpanded(variant, true);
    scrollToSection(variant);
  };

  /*
   * 「火车」比其余几个多一个分支：火车列表**一趟都没有时整节不存在**（用户要的
   * "等真有火车卡了才产生"），没有可以滚过去的地方。所以：
   *   没火车 → 让 TrainsList 直接开「添加火车」弹窗（那是加第一趟的唯一入口）；
   *   有火车 → 跟航班/住宿一样，展开并滚过去。
   * 两条合起来不会有死胡同：删掉最后一趟时列表离开 DOM，下次点又回到"开弹窗"。
   *
   * 走 requestAdd 而不是在这里放弹窗 state：弹窗住在 TrainsList 里，这个按钮是它的
   * **兄弟**（理由写在 bookings-context 里 requestAdd 的注释上）。
   */
  const handleTrainClick = () => {
    if (trains.length === 0) requestAdd("trains");
    else openSection("trains");
  };

  /*
   * 租车的"有几条"得去费用表里数 —— 它没有自己的表，**一笔租车开销就是一笔费用**
   * （见上面文件头的说明）。所以它跟另外几格一样能点亮、能显示条数，只是数据来源不同。
   *
   * 那句 `category === "租车"` 和下面弹窗的 prefill 是同一个字面量：两处都由
   * ExpenseCategory 这个联合类型把着，写错了 tsc 当场报（比较两边类型不重叠），
   * 所以不必再抽个常量出来。
   */
  const carRentalCount = expenses.filter((e) => e.category === "租车").length;

  /*
   * 每一格只看一个数：**有几条**。图标橙不橙、右上角有没有小圆点，都由它推出来
   * （见下面渲染处的 hasItems）。
   *
   * 别把"展开态"混进来当判据 —— 以前图标是 `expanded[variant]` 点亮的，而
   * 航班/住宿的展开态初始就是 true（它们的列表一直在，空态是个空壳），于是这两格
   * 永远橙色、看着像"已经有内容了"。展开与否是**位置**的事，跟有没有内容无关。
   */
  const bookingItems = [
    {
      icon: Plane,
      label: "航班",
      count: flights.length,
      variant: "flights" as const,
      onClick: () => openSection("flights"),
    },
    {
      icon: Bed,
      label: "住宿",
      count: hotels.length,
      variant: "hotels" as const,
      onClick: () => openSection("hotels"),
    },
    // 租车：没有列表节，点了直接开「添加费用」（类别预填「租车」）；条数从费用表里数
    {
      icon: Car,
      label: "租车",
      count: carRentalCount,
      onClick: () => setShowCarRental(true),
    },
    {
      icon: Train,
      label: "火车",
      count: trains.length,
      variant: "trains" as const,
      onClick: handleTrainClick,
    },
    { icon: Paperclip, label: "附件", count: 0 },
    { icon: MoreHorizontal, label: "其他", count: 0 },
  ];

  return (
    <>
      {/*
        h-full：与右侧预算摘要卡同一行，撑满 grid 给的行高，两张卡底边框才齐。
        这一行里这张卡是高的那张，行高由它决定 —— 收它才是真的收整行。

        px-6 py-4 而不是 p-6：横向那 24 是跟正文列（DetailContent 的 px-6）对齐的，
        不动；只把竖向从 24 收到 16。mb-6 → mb-4 同理，标题底下那段也是两张卡共有的。

        纯白底试过改成浅灰（跟列表里那些航班/住宿卡一致），最后还是要白的 ——
        这两张是直接摆在 gray-50 页面上的，白底反而是一行里唯一的亮面。
        **右边那张摘要卡必须同步改同一组类**，否则只是把矮的那张往上拉、整行纹丝不动。
      */}
      <div className="bg-white rounded-lg px-6 py-4 shadow-sm h-full">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">预订和附件</h3>
        <div className="flex items-center justify-between">
          {bookingItems.map((item) => {
            /*
             * 一格"有内容"= count > 0，图标和小圆点都看它，免得两处各说各话。
             */
            const hasItems = item.count > 0;
            return (
              <Button
                key={item.label}
                variant="ghost"
                className="flex flex-col items-center gap-2 h-auto p-2 hover:opacity-70"
                onClick={item.onClick}
              >
                <div className="relative">
                  <item.icon
                    className={
                      hasItems
                        ? "h-6 w-6 text-orange-500"
                        : "h-6 w-6 text-gray-700"
                    }
                  />
                  {hasItems && (
                    <div className="absolute -top-1 -right-1 h-2 w-2 bg-orange-500 rounded-full" />
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-gray-600">{item.label}</span>
                  {item.count > 0 && (
                    <span className="text-xs font-semibold text-gray-900">
                      {item.count}
                    </span>
                  )}
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      {/*
        租车那笔账：只预填**类别**，描述留空让用户自己写 —— 跟「选择项目」里
        只按类别记是同一条规矩（handleSelectCategory 那里写了理由）。预填了类别，
        弹窗里那一行就不是占位文案而是「租车」，用户只需填金额和描述。
      */}
      <AddExpenseDialog
        open={showCarRental}
        onOpenChange={setShowCarRental}
        prefill={{ category: "租车" }}
        onEditExisting={(expense) => setEditingExpenseId(expense.id)}
      />

      {/* 从上面那个框的「选择项目」里挑到已记账的项目时接手 */}
      <EditExpenseDialog
        expense={editingExpense}
        onOpenChange={(open) => !open && setEditingExpenseId(null)}
      />
    </>
  );
}
