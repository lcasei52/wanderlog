"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Settings, Users, FileText } from "lucide-react";
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

export default function BudgetCard({ budget, budgetCurrency, tripId }: BudgetCardProps) {
  const { totalSpent } = useExpenses();

  const [showBudgetSettings, setShowBudgetSettings] = useState(false);
  const [showTeamBalance, setShowTeamBalance] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  // 币种符号统一走 lib/utils：这里以前只认 CNY/USD/EUR，
  // 而「编辑预算」的下拉里有英镑和日元，存了 GBP 会显示成 €
  const currency = budgetCurrency || "CNY";
  const symbol = currencySymbol(currency);

  // 进度条百分比
  const progress = budget && budget > 0 ? Math.min((totalSpent / budget) * 100, 100) : 0;
  const isOverBudget = budget && totalSpent > budget;

  return (
    <>
      <Card className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="flex">
          {/* 左侧 4/5 */}
          <div className="flex-4 p-6 space-y-4">
            {/* 总金额 */}
            <div>
              <p className="text-sm text-gray-500 mb-1">当前总额</p>
              <p className="text-3xl font-bold text-gray-900">
                {formatCurrency(totalSpent, currency)}
              </p>
            </div>

            {/* 进度条（仅在设置了预算时显示） */}
            {budget && budget > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">预算使用</span>
                  <span className={isOverBudget ? "text-red-600 font-semibold" : "text-gray-900"}>
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

            {/* 操作按钮 */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBudgetSettings(true)}
              >
                编辑预算
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTeamBalance(true)}
              >
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
                document.getElementById('expenses-list')?.scrollIntoView({ behavior: 'smooth' });
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

      <AddMemberDialog
        open={showAddMember}
        onOpenChange={setShowAddMember}
      />
    </>
  );
}
