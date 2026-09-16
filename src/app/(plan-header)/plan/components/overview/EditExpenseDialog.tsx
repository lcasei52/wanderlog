"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useExpenses } from "@/context/expenses-context";
import { useMembers } from "@/context/members-context";
import type { Expense } from "@/types/expense";
import ExpenseFormFields, {
  draftFromExpense,
  draftToPayload,
  emptyDraft,
  validateDraft,
  type ExpenseDraft,
} from "./ExpenseFormFields";

interface EditExpenseDialogProps {
  /** null 表示没在编辑（弹窗关闭） */
  expense: Expense | null;
  onOpenChange: (open: boolean) => void;
}

export default function EditExpenseDialog({
  expense,
  onOpenChange,
}: EditExpenseDialogProps) {
  const { members } = useMembers();
  const { updateExpense, deleteExpense } = useExpenses();

  const [draft, setDraft] = useState<ExpenseDraft>(() => emptyDraft(members));
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /*
   * 弹窗常驻挂载、只切 open，所以表单得自己盯着源头那行。
   *
   * 传进来的 `expense` 是**当下那一行**（ExpensesList 按 id 现取，不是点击时存下的
   * 旧对象），因此它的身份只在两种情况下会变，两种都该把表单拉回源头：
   *   1. 换了一笔 / 重新打开 —— 重开时它会先变 null 再变回来，这个 effect 自然重跑，
   *      「确认删除」那个中间态也跟着复位；
   *   2. **这一笔被改了**，典型是撤销把它还原成旧值 —— 不重置的话，用户点保存就把
   *      撤掉的值又写回库了。
   */
  useEffect(() => {
    if (!expense) return;
    setDraft(draftFromExpense(expense));
    setConfirmingDelete(false);
  }, [expense]);

  const setField = <K extends keyof ExpenseDraft>(
    key: K,
    value: ExpenseDraft[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!expense) return;
    const error = validateDraft(draft);
    if (error) {
      toast.error(error);
      return;
    }

    setSaving(true);
    try {
      await updateExpense(expense.id, draftToPayload(draft));
      toast.success("费用已保存");
      onOpenChange(false);
    } catch (err) {
      console.error("保存费用失败:", err);
      toast.error("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!expense) return;
    // 第一次点只是改成「确认删除」，避免误触把这笔账删掉
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    setSaving(true);
    try {
      await deleteExpense(expense.id);
      toast.success("费用已删除");
      onOpenChange(false);
    } catch (err) {
      console.error("删除费用失败:", err);
      toast.error("删除失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={expense != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold text-gray-900">
            编辑费用
          </DialogTitle>
        </DialogHeader>

        {expense && (
          <ExpenseFormFields
            draft={draft}
            onChange={setField}
            members={members}
          />
        )}

        {/*
          删除和保存并排居中（参照物如此），没有「取消」——右上角 ×、Esc、点遮罩
          都能关掉这个弹窗。删除做成灰底药丸，不是红字：它就在保存旁边，红色在
          这个距离上太吵，而第一次点只会变成「确认删除」。
        */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            className="rounded-full px-5"
            onClick={handleDelete}
            disabled={saving}
          >
            <Trash2 className="size-4" />
            {confirmingDelete ? "确认删除" : "删除"}
          </Button>

          <Button
            type="button"
            size="lg"
            className="rounded-full bg-orange-500 px-8 hover:bg-orange-600"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : "保存"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
