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

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm h-full">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">预算</h3>
      <p className="text-2xl font-semibold text-gray-900">
        {formatCurrency(totalSpent, currency)}
      </p>
      <Button
        variant="link"
        className="text-sm text-blue-600 hover:text-blue-700 p-0 h-auto mt-2"
        onClick={scrollToBudget}
      >
        查看详情
      </Button>
    </div>
  );
}
