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
   *
   * （这段写在 return 外面而不是写成 JSX 注释：括号里下面只有这一个根元素，
   *  在它前面多放一个表达式节点就不是"单根"了，tsc 当场报错。）
   */
  return (
    <div className="bg-white rounded-lg px-6 py-4 shadow-sm h-full">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">预算</h3>
      <p className="text-xl font-semibold text-gray-900">
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
