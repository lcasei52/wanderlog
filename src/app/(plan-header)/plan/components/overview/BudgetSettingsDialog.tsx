"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import CurrencyMenu from "@/components/CurrencyMenu";
import { toast } from "sonner";
import { updateTripBudget } from "@/actions/trips";

interface BudgetSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  currentBudget?: number | null;
  currentCurrency?: string;
}

/**
 * 设定预算：一个标题 + 一行金额（前面那个符号点开换币种）+ 一个保存按钮。
 * 没有取消按钮 —— 关掉就是放弃（右上角的 × / Esc / 点遮罩都行）。
 *
 * 币种符号做成输入框内的前缀而不是单独一行 Select：它本来就只影响这一个数字的
 * 单位，拆成两个字段会让人以为要分别保存。
 */
export default function BudgetSettingsDialog({
  open,
  onOpenChange,
  tripId,
  currentBudget,
  currentCurrency = "CNY",
}: BudgetSettingsDialogProps) {
  const [budget, setBudget] = useState(currentBudget?.toString() || "");
  const [currency, setCurrency] = useState(currentCurrency);
  const [saving, setSaving] = useState(false);

  // 这个对话框跟着 BudgetCard 常驻挂载，useState 的初值只取一次。
  // 不每次打开都回填的话，保存后再打开看到的会是上次输入框里的残留值。
  useEffect(() => {
    if (!open) return;
    setBudget(currentBudget != null ? String(currentBudget) : "");
    setCurrency(currentCurrency);
  }, [open, currentBudget, currentCurrency]);

  const handleSave = async () => {
    const budgetValue = budget.trim() === "" ? null : parseFloat(budget);

    if (budgetValue !== null && (isNaN(budgetValue) || budgetValue < 0)) {
      toast.error("请输入有效的预算金额");
      return;
    }

    setSaving(true);
    try {
      await updateTripBudget(tripId, budgetValue, currency);
      toast.success(budgetValue === null ? "已清除预算" : "预算已更新");
      onOpenChange(false);
      /*
       * 这里以前还有一行 router.refresh()，删了。
       * updateTripBudget 里已经调了 revalidatePath —— 按 Next 的机制，那一下会把
       * 重渲染后的页面搭在这次 action **自己的响应**里带回来，客户端再 refresh 一次
       * 是白跑一趟（又是一次 8 条查询）。两者留一个就够，留 action 里那个。
       */
    } catch (err) {
      console.error("更新预算失败:", err);
      toast.error("更新失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {/* 唯一的标题：居中、加粗、放大（DialogTitle 默认是 text-base/medium，这里全盖掉） */}
          <DialogTitle className="text-center text-2xl font-bold text-gray-900">
            设定预算
          </DialogTitle>
        </DialogHeader>

        <InputGroup className="h-12">
          <InputGroupAddon align="inline-start">
            <CurrencyMenu
              value={currency}
              onChange={setCurrency}
              triggerClassName="px-1 text-base"
            />
          </InputGroupAddon>

          <InputGroupInput
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="留空表示不设预算"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="h-full text-lg [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </InputGroup>

        <Button
          type="button"
          size="lg"
          className="w-full rounded-full bg-orange-500 hover:bg-orange-600"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : "保存"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
