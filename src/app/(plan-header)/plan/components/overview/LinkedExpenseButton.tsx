"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExpenses } from "@/context/expenses-context";
import type { Expense } from "@/types/expense";
import { formatCurrency } from "@/lib/utils";
import AddExpenseDialog, { type ExpensePrefill } from "./AddExpenseDialog";
import EditExpenseDialog from "./EditExpenseDialog";

/**
 * 能挂费用的四种行程项目，与 expenses.linked_item_type 对应。
 * 加类型时另外两处字面量联合也要改（expense-helpers 的 PickableItem、
 * AddExpenseDialog 的 ExpensePrefill），漏了编译照过、运行时表现为"选了却记不上"。
 */
type LinkedItemType = "place" | "flight" | "hotel" | "train";

interface LinkedExpenseButtonProps {
  linkedItemType: LinkedItemType;
  linkedItemId: string;
  /**
   * 点「添加费用」时的预填（名称/类别/日期）。一般是
   * `{...inferFromFlight(flight), date: flight.date}` 这种，让用户只需填金额。
   */
  prefill: Omit<ExpensePrefill, "linkedItemType" | "linkedItemId">;
}

/**
 * 地点卡 / 航班卡 / 住宿卡上那一格「费用」。
 *
 * **expenses 才是唯一事实来源**：这个按钮不存金额，每次渲染都去费用表里按
 * (linkedItemType, linkedItemId) 反查那一条。所以不管钱是在哪儿改的 —— 预算里的
 * 费用行、这张卡上点开的编辑框、还是「＋ 添加费用」里选到这个项目 ——
 * 三处看到的立刻是同一个数。以前航班/住宿卡把金额抄进了表单 draft，
 * 在预算里改完金额，卡片上那个输入框还是旧数，再点一次保存还会把旧值写回去。
 *
 * 两条互斥的路，各自名副其实：
 *  - 还没记过账 → 灰底「添加费用」开 AddExpenseDialog（选项目/类别那套）；
 *  - 记过账 → 蓝框显示金额，点开 EditExpenseDialog —— 跟预算-费用里点一行，
 *    以及地点卡上点蓝框，是**同一个组件**。
 *
 * 一个项目只允许一笔费用，所以不存在"同一个项目记两笔"的路径。
 * 两个弹窗都由本组件自己持有：调用方只需要摆一个按钮的位置。
 */
export default function LinkedExpenseButton({
  linkedItemType,
  linkedItemId,
  prefill,
}: LinkedExpenseButtonProps) {
  const { expenses } = useExpenses();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const linkedExpense = expenses.find(
    (e) => e.linkedItemType === linkedItemType && e.linkedItemId === linkedItemId,
  );

  return (
    <>
      {linkedExpense ? (
        <button
          type="button"
          onClick={() => setEditingExpense(linkedExpense)}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-50 px-2 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-100"
        >
          <Wallet className="h-3.5 w-3.5" />
          {formatCurrency(linkedExpense.amount, linkedExpense.currency)}
        </button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1 text-gray-600"
          onClick={() => setShowAddDialog(true)}
        >
          <Wallet className="h-3.5 w-3.5" />
          添加费用
        </Button>
      )}

      <AddExpenseDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        prefill={{ ...prefill, linkedItemType, linkedItemId }}
        // 在「选择项目」里挑到别的已记账项目：换成编辑框，别记出第二笔
        onEditExisting={setEditingExpense}
      />

      <EditExpenseDialog
        expense={editingExpense}
        onOpenChange={(open) => !open && setEditingExpense(null)}
      />
    </>
  );
}
