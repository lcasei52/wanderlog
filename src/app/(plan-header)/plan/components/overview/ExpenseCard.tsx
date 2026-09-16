"use client";

import { useMembers } from "@/context/members-context";
import { MemberAvatarStack } from "@/components/MemberAvatar";
import { formatExpenseDate } from "@/lib/expense-helpers";
import CategoryIcon from "@/components/CategoryIcon";
import { formatCurrency } from "@/lib/utils";
import type { Expense } from "@/types/expense";

interface ExpenseCardProps {
  expense: Expense;
  /** 点整张卡片打开「编辑费用」 */
  onClick: () => void;
}

/**
 * 费用列表里的一行：左边类别图标 + 名称/日期·类别两行，右边金额，金额下面一摞参与人。
 */
export default function ExpenseCard({ expense, onClick }: ExpenseCardProps) {
  const { getMember } = useMembers();

  // 参与人：分摊给谁就显示谁；不分摊时这笔钱只有付款人自己承担，显示付款人
  const involvedIds =
    expense.splitWith.length > 0 ? expense.splitWith : [expense.paidBy];
  const involved = involvedIds
    .map((id) => getMember(id))
    .filter((m): m is NonNullable<typeof m> => m != null);

  const dateLabel = formatExpenseDate(expense.date);
  const meta = dateLabel ? `${dateLabel} · ${expense.category}` : expense.category;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100">
        <CategoryIcon category={expense.category} className="size-5 text-gray-700" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {expense.name}
        </p>
        <p className="truncate text-xs text-gray-500">{meta}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold text-gray-900">
          {formatCurrency(expense.amount, expense.currency)}
        </span>
        {involved.length > 0 && <MemberAvatarStack members={involved} />}
      </div>
    </button>
  );
}
