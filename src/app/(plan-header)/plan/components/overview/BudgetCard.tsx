"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Settings, Users, FileText, Pencil } from "lucide-react";
import { useExpenses } from "@/context/expenses-context";
import { currencySymbol, formatCurrency } from "@/lib/utils";
import BudgetSettingsDialog from "./BudgetSettingsDialog";
import TeamBalanceDialog from "./TeamBalanceDialog";
import AddMemberDialog from "./AddMemberDialog";

interface BudgetCardProps {
  budget?: number | null;
  budgetCurrency?: string | null;
  tripId: string;
}

export default function BudgetCard({
  budget,
  budgetCurrency,
  tripId,
}: BudgetCardProps) {
  const { totalSpent } = useExpenses();

  const [showBudgetSettings, setShowBudgetSettings] = useState(false);
  const [showTeamBalance, setShowTeamBalance] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  // 币种符号统一走 lib/utils：这里以前只认 CNY/USD/EUR，
  // 而「编辑预算」的下拉里有英镑和日元，存了 GBP 会显示成 €
  const currency = budgetCurrency || "CNY";
  const symbol = currencySymbol(currency);

  // 进度条百分比
  const progress =
    budget && budget > 0 ? Math.min((totalSpent / budget) * 100, 100) : 0;
  const isOverBudget = budget && totalSpent > budget;

  return (
    <>
      <Card className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="flex">
          {/* 左侧 4/5 */}
          <div className="flex-4 p-6 space-y-4">
            {/* 总金额 */}
            <div>
              <p className="text-4xl text-gray-900">
                {formatCurrency(totalSpent, currency)}
              </p>
            </div>

            {/* 进度条（仅在设置了预算时显示） */}
            {budget && budget > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">预算使用</span>
                  <span
                    className={
                      isOverBudget
                        ? "text-red-600 font-semibold"
                        : "text-gray-900"
                    }
                  >
                    {formatCurrency(budget, currency)}
                  </span>
                </div>
                <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 h-full transition-all ${
                      isOverBudget ? "bg-red-500" : "bg-orange-500"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {isOverBudget && (
                  <p className="text-xs text-red-600">
                    已超出预算 {formatCurrency(totalSpent - budget, currency)}
                  </p>
                )}
              </div>
            )}

            {/*
              操作按钮。样式跟 DetailContent 里那颗「选择日期」是同一套写法：
              outline 变体自带描边和 hover 底，这里用 border-0 + bg-gray-100 盖掉 ——
              它们是这一屏的"内容块"，描边按钮摆在这儿比卡片本身还重。

              ★ size 用 lg（h-9）而不是原来的 sm（h-7）：文字从 sm 档（0.8rem）提到
                text-base 之后，h-7 那个高度会把字挤得贴边。图标写 size-4 是必须的 ——
                Button 基类那条 [&_svg:not([class*='size-'])]:size-4 只认 size- 开头的类，
                写成 h-4 w-4 会被它当没写。
            */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="lg"
                className="gap-2 border-0 bg-gray-100 text-base font-semibold text-gray-700 hover:bg-gray-200 hover:text-gray-900"
                onClick={() => setShowBudgetSettings(true)}
              >
                <Pencil className="size-4" />
                编辑预算
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="gap-2 border-0 bg-gray-100 text-base font-semibold text-gray-700 hover:bg-gray-200 hover:text-gray-900"
                onClick={() => setShowTeamBalance(true)}
              >
                <Users className="size-4" />
                团队情况
              </Button>
            </div>
          </div>

          {/* 右侧 1/5 - 竖向三个图标按钮 */}
          <div className="flex-1 border-l border-gray-200 flex flex-col divide-y divide-gray-200">
            <button
              className="flex-1 flex flex-col items-center justify-center gap-1 hover:bg-gray-50 transition-colors p-3"
              onClick={() => {
                // 滚动到费用列表
                document
                  .getElementById("expenses-list")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <FileText className="h-5 w-5 text-gray-600" />
              <span className="text-xs text-gray-600">查看明细</span>
            </button>

            <button
              className="flex-1 flex flex-col items-center justify-center gap-1 hover:bg-gray-50 transition-colors p-3"
              onClick={() => setShowAddMember(true)}
            >
              <Users className="h-5 w-5 text-gray-600" />
              <span className="text-xs text-gray-600">添加伙伴</span>
            </button>

            <button
              className="flex-1 flex flex-col items-center justify-center gap-1 hover:bg-gray-50 transition-colors p-3"
              onClick={() => setShowBudgetSettings(true)}
            >
              <Settings className="h-5 w-5 text-gray-600" />
              <span className="text-xs text-gray-600">设置</span>
            </button>
          </div>
        </div>
      </Card>

      {/* 对话框 */}
      <BudgetSettingsDialog
        open={showBudgetSettings}
        onOpenChange={setShowBudgetSettings}
        tripId={tripId}
        currentBudget={budget}
        currentCurrency={currency}
      />

      <TeamBalanceDialog
        open={showTeamBalance}
        onOpenChange={setShowTeamBalance}
      />

      <AddMemberDialog open={showAddMember} onOpenChange={setShowAddMember} />
    </>
  );
}
