"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
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
import { type Expense, type ExpenseCategory } from "@/types/expense";
import CategoryIcon from "@/components/CategoryIcon";
import type { PickableItem } from "@/lib/expense-helpers";
import ExpenseFormFields, {
  draftToPayload,
  emptyDraft,
  validateDraft,
  type ExpenseDraft,
} from "./ExpenseFormFields";
import ItemPickerDialog from "./ItemPickerDialog";

/**
 * 从卡片快捷入口打开时的预填。linkedItemType/Id 会跟着费用一起入库，
 * 用来知道这笔钱是从哪个航班/住宿/火车/地点记的。
 */
export interface ExpensePrefill {
  name?: string;
  amount?: string;
  category?: ExpenseCategory;
  date?: string;
  paidBy?: string;
  /** 同 PickableItem.linkedItemType / LinkedExpenseButton 的 LinkedItemType，改要三处一起改 */
  linkedItemType?: "place" | "flight" | "hotel" | "train" | null;
  linkedItemId?: string | null;
}

interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: ExpensePrefill;
  /**
   * 在「选择项目」里选中一个**已经记过账**的项目时调这个（而不是自己弹编辑框）。
   *
   * 一个行程项目只允许一笔费用，所以这时要做的不是"再记一笔"而是"改那一笔"——
   * 那就该由调用方换成 EditExpenseDialog。本组件只管新增，编辑只有那一个入口，
   * 免得同一笔账在两条路上长得不一样。
   *
   * 必填：任何调用方都会被用户选到已记账的项目，漏了就是"选完没反应"。
   */
  onEditExisting: (expense: Expense) => void;
}

/**
 * 「添加费用」：金额 → 选项目 → 描述 → 付款人 → 分摊 → 日期，保存。
 *
 * 「项目」和「描述」是配套的两栏：项目决定这笔开销属于哪个**类别**
 * （那一行只显示类别，图案跟着变），描述则是用户看到的那行字 ——
 * 选了现成的项目就把它的名字自动填进描述，只按类别记就自己写。
 * 所以这里没有单独的「费用名称」输入框（描述就是它），也没有类别下拉。
 *
 * **只负责新增**。改一笔走 EditExpenseDialog（预算里的费用行、地点卡上的金额
 * 都是它），两条路各有各的组件、不会漂移。
 */
export default function AddExpenseDialog({
  open,
  onOpenChange,
  prefill,
  onEditExisting,
}: AddExpenseDialogProps) {
  const { members } = useMembers();
  const { expenses, addExpense } = useExpenses();

  const [draft, setDraft] = useState<ExpenseDraft>(() => emptyDraft(members));
  const [showPicker, setShowPicker] = useState(false);
  const [linked, setLinked] = useState<{
    key: string | null;
    type: string | null;
    id: string | null;
  }>({ key: null, type: null, id: null });
  /**
   * 有没有挑过东西（项目或类别）。光看 draft.category 不行 —— 它初值就是
   * 「其他」，那样一打开弹窗就会显示成"已经选了其他"，所以另记一个开关，
   * 没挑过时那一行显示占位文案。
   */
  const [picked, setPicked] = useState(false);
  const [saving, setSaving] = useState(false);

  /** 某个行程项目已经记过的那笔费用；没有则 undefined */
  const findLinkedExpense = (
    type: string | null | undefined,
    id: string | null | undefined,
  ) =>
    type && id
      ? expenses.find(
          (e) => e.linkedItemType === type && e.linkedItemId === id,
        )
      : undefined;

  /*
   * 常驻挂载、只切 open，所以每次打开都要按预填重置一遍。
   *
   * prefill / members 走 ref、不进依赖数组：调用方（PlaceCard）传的 prefill 是
   * 内联对象字面量，每次父级重渲染都是新引用 —— 放进依赖里的话，弹窗开着时
   * 父级一重渲染就会重跑这个 effect，把用户输了一半的金额清掉。
   * 只在 open 由 false 翻成 true 时重置，才是"打开时预填一次"的本意。
   */
  const prefillRef = useRef(prefill);
  prefillRef.current = prefill;
  const membersRef = useRef(members);
  membersRef.current = members;

  useEffect(() => {
    if (!open) return;
    const currentMembers = membersRef.current;
    const seed = prefillRef.current;

    setDraft(
      emptyDraft(currentMembers, {
        name: seed?.name ?? "",
        amount: seed?.amount ?? "",
        category: seed?.category ?? "其他",
        date: seed?.date ?? "",
        paidBy: seed?.paidBy ?? currentMembers[0]?.id ?? "",
      }),
    );
    setLinked({
      key: null,
      type: seed?.linkedItemType ?? null,
      id: seed?.linkedItemId ?? null,
    });
    // 预填带了名字/类别，等同于"已经挑过了"
    setPicked(Boolean(seed?.name || seed?.category || seed?.linkedItemId));
    setShowPicker(false);
  }, [open]);

  const setField = <K extends keyof ExpenseDraft>(
    key: K,
    value: ExpenseDraft[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  /*
   * 选一个项目 = 在那个项目的卡片上点「添加费用」，两者结果必须一致。
   *
   * 日期那一栏：卡片那条路会把 item.dayDate 预填进来（PlaceCard 传的 prefill），
   * 费用因此自动落在当天；这里以前没带，于是账记下了却不属于任何一天，在当天列表
   * 里根本看不到 —— 看着就像"没加上"。只在日期还空着时补，用户先手选了日期再回头
   * 换项目的话不该被顶掉。
   *
   * 选到**已经记过账**的项目则是另一回事：一个项目只允许一笔费用，这时要做的不是
   * "再记一笔"而是"改那一笔"，所以关掉自己、把那条记录交回给调用方去开
   * EditExpenseDialog。本组件没有编辑态 —— 编辑只有那一个组件，两条路不会漂移。
   */
  const handleSelectItem = (item: PickableItem) => {
    setLinked({ key: item.key, type: item.linkedItemType, id: item.linkedItemId });
    setPicked(true);
    setShowPicker(false);

    const existing = findLinkedExpense(item.linkedItemType, item.linkedItemId);
    if (existing) {
      // 先关自己再开编辑框：两个弹窗同时挂着会叠在一起
      onOpenChange(false);
      onEditExisting(existing);
      return;
    }

    // 选项目连类别一起带出来，同时把项目名填进「描述」——用户可以再改成别的说法
    setDraft((prev) => ({
      ...prev,
      name: item.name,
      category: item.category,
      date: prev.date || item.date || "",
    }));
  };

  const handleSelectCategory = (category: ExpenseCategory) => {
    setDraft((prev) => ({
      ...prev,
      category,
      /*
       * 只按类别记时没有名字可带，「描述」留空让用户自己填。
       * 但"从某个项目切回只选类别"是另一回事 —— 那个名字是项目带出来的、
       * 已经不代表这笔账了，要清掉；用户自己敲的内容（linked.key 为空）留着。
       */
      name: linked.key ? "" : prev.name,
    }));
    setLinked({ key: null, type: null, id: null });
    setPicked(true);
    setShowPicker(false);
  };

  const handleSave = async () => {
    // 描述为空分两种情况，说清楚是哪一种比 validateDraft 的"请填写费用名称"准
    if (!draft.name.trim()) {
      toast.error(picked ? "请填写描述" : "请先选择项目或类别");
      return;
    }
    const error = validateDraft(draft);
    if (error) {
      toast.error(error);
      return;
    }

    setSaving(true);
    try {
      const created = await addExpense({
        ...draftToPayload(draft),
        linkedItemType: linked.type,
        linkedItemId: linked.id,
      });
      if (!created) {
        toast.error("添加失败，请重试");
        return;
      }
      toast.success("费用已添加");
      onOpenChange(false);
    } catch (err) {
      console.error("添加费用失败:", err);
      toast.error("添加失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  /**
   * 金额下面那一行：只显示类别（图案跟着类别走），点开才是「选择项目」弹窗。
   * 没挑过任何东西时退成占位文案 —— 类别初值「其他」是兜底值，不是用户的选择，
   * 直接显示出来会让人以为已经选好了。
   */
  const itemPickerRow = (
    <button
      type="button"
      onClick={() => setShowPicker(true)}
      className="flex h-11 w-full items-center gap-2 rounded-lg border border-input px-2.5 text-left transition-colors hover:bg-gray-50"
    >
      {picked ? (
        <>
          <CategoryIcon category={draft.category} className="size-5 text-gray-600" />
          <span className="text-sm text-gray-900">{draft.category}</span>
        </>
      ) : (
        <span className="text-sm text-gray-400">选择项目或类别</span>
      )}
      <ChevronRight className="ml-auto size-4 shrink-0 text-gray-400" />
    </button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            {/* 唯一的标题：居中、加粗、放大 */}
            <DialogTitle className="text-center text-2xl font-bold text-gray-900">
              添加费用
            </DialogTitle>
          </DialogHeader>

          {/*
            字段固定是"添加"那一套：「选择项目」那一行决定类别（类别不单独给下拉），
            名称那一栏改叫「描述」。这一整块只有这一种形态，所以没有开关 ——
            编辑态已经不在这儿了（选中已记账的项目会换 EditExpenseDialog）。
          */}
          <ExpenseFormFields
            draft={draft}
            onChange={setField}
            members={members}
            aboveName={itemPickerRow}
            // 「名称」那一栏在添加流程里叫「描述」：它就是费用列表里显示的那行字
            nameLabel="描述"
            namePlaceholder="选项目会自动填，也可以自己写"
            showCategory={false}
          />

          {/*
            一个通栏的保存 —— 没有取消按钮，关掉（右上角 × / Esc / 点遮罩）就是放弃。
          */}
          <Button
            type="button"
            size="lg"
            className="w-full rounded-full bg-orange-500 hover:bg-orange-600"
            onClick={handleSave}
            // 真正的前提是"有付款人"（validateDraft 也在校验它），
            // 不是"有成员"——「我」那一行由 ensureTripSelfMember 保证存在
            disabled={saving || !draft.paidBy}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : "保存"}
          </Button>
        </DialogContent>
      </Dialog>

      <ItemPickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        selectedKey={linked.key}
        onSelectItem={handleSelectItem}
        onSelectCategory={handleSelectCategory}
      />
    </>
  );
}
