"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useExpenses } from "@/context/expenses-context";
import {
  EXPENSE_SORT_LABELS,
  sortExpenses,
  type ExpenseSortKey,
} from "@/lib/expense-helpers";
import ExpenseCard from "./ExpenseCard";
import EditExpenseDialog from "./EditExpenseDialog";

const SORT_KEYS = Object.keys(EXPENSE_SORT_LABELS) as ExpenseSortKey[];

/**
 * 预算区里的费用明细：一行「费用」小标题 + 排序下拉，下面是费用卡片。
 * id 是给预算卡的「查看明细」按钮滚动定位用的。
 */
export default function ExpensesList() {
  const { expenses, getExpense } = useExpenses();
  const [sortKey, setSortKey] = useState<ExpenseSortKey>("date-desc");

  /*
   * 存 id 而不是那一行的对象：撤销会把费用表换成快照里那份对象，存着旧对象的话
   * 弹窗永远看不到源头变了（最严重是会拿撤销前的值再写回库）。这里每次渲染都按 id
   * 去当下那张表里取，行一变、传下去的对象身份就变，弹窗那边的重置 effect 才跑得起来。
   */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? (getExpense(editingId) ?? null) : null;

  // 撤销可能正好把这笔费用收走 —— 那就等于关掉弹窗，别留着 id 等它被复原时自己弹开
  useEffect(() => {
    if (editingId && !getExpense(editingId)) setEditingId(null);
  }, [editingId, getExpense]);

  const sorted = useMemo(
    () => sortExpenses(expenses, sortKey),
    [expenses, sortKey],
  );

  return (
    <div id="expenses-list" className="scroll-mt-4">
      {/* 小标题 + 排序下拉同一行 */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-900">费用</h3>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-sm font-normal text-gray-500 hover:text-gray-800"
              disabled={expenses.length === 0}
            >
              <ArrowUpDown className="size-3.5" />
              {EXPENSE_SORT_LABELS[sortKey]}
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SORT_KEYS.map((key) => (
              <DropdownMenuItem key={key} onClick={() => setSortKey(key)}>
                <Check
                  className={`size-4 ${key === sortKey ? "opacity-100" : "opacity-0"}`}
                />
                {EXPENSE_SORT_LABELS[key]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          还没有费用。点右上角「＋ 添加费用」记第一笔，或者在航班/住宿/地点卡片上直接填。
        </p>
      ) : (
        <div className="space-y-1">
          {sorted.map((expense) => (
            <ExpenseCard
              key={expense.id}
              expense={expense}
              onClick={() => setEditingId(expense.id)}
            />
          ))}
        </div>
      )}

      <EditExpenseDialog
        expense={editing}
        onOpenChange={(open) => !open && setEditingId(null)}
      />
    </div>
  );
}
