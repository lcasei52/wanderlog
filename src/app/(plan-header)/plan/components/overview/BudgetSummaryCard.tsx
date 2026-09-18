"use client";

import { Button } from "@/components/ui/button";
import { useExpenses } from "@/context/expenses-context";
import { formatCurrency } from "@/lib/utils";

interface BudgetSummaryCardProps {
  budgetCurrency?: string | null;
}

/**
 * 概览里的预算摘要卡：只报一个当前总额，「查看详情」滚到「预算」大标题下。
 *
 * 真正的那张详细卡（进度条 / 团队情况 / 查看明细·添加伙伴·设置三个入口）
 * 放在「预算」大标题下 —— 概览这一格只有 1/3 列宽，装不下那张 4/5 + 1/5 的卡。
 *
 * h-full：这一格和左边「预订和附件」同行，grid 只把外层 div 拉到等高，
 * 里面这个白盒子还得自己撑满，底边框才对得齐。
 */
export default function BudgetSummaryCard({
  budgetCurrency,
}: BudgetSummaryCardProps) {
  const { totalSpent } = useExpenses();
  const currency = budgetCurrency || "CNY";

  const scrollToBudget = () =>
    document.getElementById("budget")?.scrollIntoView({ behavior: "smooth" });

  /*
   * 纯白卡，跟左边「预订和附件」是同一组（那边写了完整理由，包括"改浅灰试过又改回来"
   * 那条）。两张卡在这一行里共用同一个行高，留白和底色都必须一起改 —— 只改一张等于没改。
   * 窄屏横向那一档（px-3）也是两张一起收的，理由同样见那边。
   *
   * 金额在窄屏降一档字号（text-xl → text-base）不是因为小气：375px 上这一格只有
   * 109px 宽，收完内边距留给金额的只有 85px。text-xl 的 "¥1,234.00" 要一百出头，
   * 直接顶出白卡外面。降到 text-base 刚好放得下五位数，再长就靠 wrap-break-word 折成
   * 两行（**会折**好过溢出到卡片外面 —— 金额是这里唯一不能省的东西）。
   *
   * （这段写在 return 外面而不是写成 JSX 注释：括号里下面只有这一个根元素，
   *  在它前面多放一个表达式节点就不是"单根"了，tsc 当场报错。）
   */
  return (
    <div className="bg-white rounded-lg px-3 py-4 shadow-sm h-full sm:px-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">预算</h3>
      <p className="wrap-break-word text-base font-semibold text-gray-900 sm:text-xl">
        {formatCurrency(totalSpent, currency)}
      </p>
      {/*
        蓝色改成灰：这一格里唯一的重点应该是金额，蓝色链接在旁边跟它抢视线。
        灰的读起来就是"次级入口"，跟卡片里其它灰字（标签、说明）一档。
        variant 还是 link（下划线 + 内边距归零那套照旧），只换颜色。
      */}
      <Button
        variant="link"
        className="text-sm text-gray-500 hover:text-gray-700 p-0 h-auto mt-2"
        onClick={scrollToBudget}
      >
        查看详情
      </Button>
    </div>
  );
}
