"use client";

import { type ReactNode } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import CurrencyMenu from "@/components/CurrencyMenu";
import CategoryIcon from "@/components/CategoryIcon";
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
} from "@/types/expense";
import type { TripMember } from "@/types/member";
import MemberAvatar from "@/components/MemberAvatar";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * 每个框里最左边那行字段名。黑体加粗 —— 参照 Wanderlog。以前用的是浅灰小字
 * （text-gray-500），框放大之后那个颜色读起来像占位符，分不清哪是标签哪是内容。
 */
const FIELD_LABEL = "shrink-0 text-sm font-semibold text-gray-900";

/** 添加/编辑费用共用的表单态。金额存字符串，保存时才转数字（输入中途可能只是 "12."） */
export interface ExpenseDraft {
  amount: string;
  /** ISO 代码（CNY/USD…），金额框最左边那个符号点开可改 */
  currency: string;
  category: ExpenseCategory;
  name: string;
  description: string;
  /** "YYYY-MM-DD"，空串 = 不填日期 */
  date: string;
  /** 付款人 member id */
  paidBy: string;
  /** 参与分摊的 member id；空数组 = 不分摊（付款人自己承担） */
  splitWith: string[];
}

export function emptyDraft(
  members: TripMember[],
  overrides: Partial<ExpenseDraft> = {},
): ExpenseDraft {
  return {
    amount: "",
    currency: "CNY",
    category: "其他",
    name: "",
    description: "",
    date: "",
    /*
     * 付款人默认选 members[0]，也就是「我」（ensureTripSelfMember 保证排在
     * position 0），多数情况下记的就是自己付的账。
     */
    paidBy: members[0]?.id ?? "",
    splitWith: [],
    ...overrides,
  };
}

/**
 * 已入库的一条费用 → 表单态。编辑费用用它灌初值，添加费用在"选中的项目已经
 * 记过账"时也用它 —— 那种情况两个入口展示的是同一个「新增/编辑」框。
 */
export function draftFromExpense(expense: Expense): ExpenseDraft {
  return {
    amount: String(expense.amount),
    currency: expense.currency,
    // category 在库里是普通 text 列（schema 里没上 enum），这里收窄回字面量联合。
    // 万一存的是清单外的值，下拉会显示不出选中项，但 CategoryIcon 有兜底图标。
    category: expense.category as ExpenseCategory,
    name: expense.name,
    description: expense.description ?? "",
    date: expense.date ?? "",
    paidBy: expense.paidBy,
    splitWith: expense.splitWith,
  };
}

/** 校验并转成可入库的值；返回错误文案，通过则返回 null */
export function validateDraft(draft: ExpenseDraft): string | null {
  const amount = Number(draft.amount);
  if (draft.amount.trim() === "") return "请填写金额";
  if (!Number.isFinite(amount) || amount <= 0) return "金额需要是大于 0 的数字";
  if (!draft.name.trim()) return "请填写费用名称";
  if (!draft.paidBy) return "请选择付款人";
  // 不分摊（splitWith 为空）是合法选择，付款人自己承担
  return null;
}

export interface ExpensePayload {
  amount: number;
  currency: string;
  category: ExpenseCategory;
  name: string;
  description: string | null;
  date: string | null;
  paidBy: string;
  splitWith: string[];
}

export function draftToPayload(draft: ExpenseDraft): ExpensePayload {
  return {
    amount: Number(draft.amount),
    currency: draft.currency,
    category: draft.category,
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    date: draft.date || null,
    paidBy: draft.paidBy,
    splitWith: draft.splitWith,
  };
}

/**
 * 下拉框里「值」的那一段：把它顶到框的最右边（触发器是 justify-between，
 * 三格会把值摆在正中间，不是我们要的）。
 *
 * 为什么套一层、以及为什么还要给里面那个 span 补 flex：
 *  - SelectValue 的实现把 className 从 props 里解构出来后就丢了，压根没往 DOM
 *    上传（见 node_modules/@radix-ui/react-select 的 SelectValue），所以对齐只能
 *    加在这层壳上。
 *  - shadcn 的 SelectTrigger 是靠 `*:data-[slot=select-value]:flex` 给值那一格
 *    上 flex 的，而那是**直接子元素**选择器。套了这一层之后 SelectValue 不再是
 *    trigger 的亲儿子，那条规则就失配了 —— 失配的后果不是排布难看而是**折行**：
 *    头像（Avatar 根节点是 display:flex，块级）会把后面的名字挤到第二行去。
 *    所以 [&>span] 这一串是在替 shadcn 把那条规则补回来。
 *
 * 截断不在这里做：值里的名字来自 SelectItem 里那个 span，类名跟着节点一起被
 * 克隆过来，所以 truncate 写在 SelectItem 那一侧更稳（见下面的付款人）。
 */
function TriggerValue({ placeholder }: { placeholder?: string }) {
  return (
    <span className="ml-auto flex min-w-0 items-center [&>span]:flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-1.5">
      <SelectValue placeholder={placeholder} />
    </span>
  );
}

interface ExpenseFormFieldsProps {
  draft: ExpenseDraft;
  onChange: <K extends keyof ExpenseDraft>(
    key: K,
    value: ExpenseDraft[K],
  ) => void;
  members: TripMember[];
  /** 插在金额下面的一整块（添加费用时是「选择项目」那一行） */
  aboveName?: ReactNode;
  /**
   * 是否显示「名称」输入框。添加流程里名称由「选择项目」带出来、且那一栏改叫
   * 「描述」（见下），仍然要显示，所以默认开着。
   */
  showName?: boolean;
  /**
   * 「名称」这一栏在框里叫什么。添加流程传「描述」—— 那边没有独立的名称输入框，
   * 用户在这里敲的字就是费用列表里显示的那行。留空按「费用名称」。
   */
  nameLabel?: string;
  namePlaceholder?: string;
  /**
   * 类别下拉。添加流程里类别由所选项目决定、只在「项目」那一行显示出来，
   * 所以那边关掉；编辑流程仍然要能改类别。
   */
  showCategory?: boolean;
}

/**
 * 费用表单的字段区。添加和编辑两个弹窗共用。
 *
 * 排布规则（参照 Wanderlog）：**每个字段就是一个放大的框，框里最左边写字段名、
 * 值推到最右边**，框外不再有那些小标题。三处例外：
 *  - 金额：最左边的位置被币种符号占着（点开换币种）；
 *  - 描述/名称：标签在上、内容在下，是个能长高的多行框；
 *  - 日期：压根不在框里，就是一行「日期  值  ▾」。
 * 分摊则是唯一一个**多个元素合住在同一张卡里**的（头行 + 勾选人 + 每人金额）。
 */
export default function ExpenseFormFields({
  draft,
  onChange,
  members,
  aboveName,
  showName = true,
  nameLabel = "添加描述",
  namePlaceholder = "例如：故宫门票",
  showCategory = true,
}: ExpenseFormFieldsProps) {
  const isSplit = draft.splitWith.length > 0;

  /** 切到「分摊」时默认全员勾上 —— 绝大多数 AA 就是所有人一起分 */
  const toggleSplit = (split: boolean) => {
    onChange("splitWith", split ? members.map((m) => m.id) : []);
  };

  const toggleMember = (memberId: string, checked: boolean) => {
    onChange(
      "splitWith",
      checked
        ? [...draft.splitWith, memberId]
        : draft.splitWith.filter((id) => id !== memberId),
    );
  };

  /*
   * 卡底那行「¥850.00/人」。金额还没填完（空串、或者刚敲到 "12."）时算不出人均，
   * 这时显示占位横杠而不是 NaN 或者一个会跳动的数。
   */
  const amountValue = Number(draft.amount);
  const perPerson =
    isSplit && Number.isFinite(amountValue) && amountValue > 0
      ? formatCurrency(amountValue / draft.splitWith.length, draft.currency)
      : null;

  return (
    <div className="space-y-3">
      {/* 金额：最左边是币种（点开换），右边是数字 */}
      <InputGroup className="h-11">
        <InputGroupAddon align="inline-start">
          <CurrencyMenu
            value={draft.currency}
            onChange={(code) => onChange("currency", code)}
            // 符号跟金额一样大、一样粗
            triggerClassName="px-1 text-lg font-semibold text-gray-900"
          />
        </InputGroupAddon>
        <InputGroupInput
          /*
           * h-full 压掉 Input 自带的 h-8。字号要写两遍：Input 带一个
           * md:text-sm，那是带 md: 变体的类，跟 text-lg 不算同一组冲突，
           * twMerge 删不掉它，只能在同一档变体上再声明一次才盖得住。
           */
          id="expense-amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="0.00"
          className="h-full text-lg font-semibold md:text-lg [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={draft.amount}
          onChange={(e) => onChange("amount", e.target.value)}
        />
      </InputGroup>

      {aboveName}

      {/*
        名称 / 描述：标签在上、内容在下，框能跟着内容长高。
        用 InputGroup 的 block-start 排列（它自带 has-[>[data-align=block-start]]
        的竖排和 h-auto），里面的多行框用 InputGroupTextarea —— 那个组件已经把
        边框、圆角、内边距和 focus ring 都让给了外层，是现成的"框里套无框输入"。
      */}
      {showName && (
        <InputGroup>
          <InputGroupAddon align="block-start">
            <span className={FIELD_LABEL}>{nameLabel}</span>
          </InputGroupAddon>
          <InputGroupTextarea
            /*
             * min-h-12 压掉 Textarea 自带的 min-h-16（那是给独立备注框用的高度），
             * 大约两行。text-sm 写两遍同样是为了盖掉自带的 md:text-sm。
             */
            id="expense-name"
            rows={2}
            placeholder={namePlaceholder}
            className="min-h-12 text-sm md:text-sm"
            value={draft.name}
            onChange={(e) => onChange("name", e.target.value)}
          />
        </InputGroup>
      )}

      {/* 类别：只有编辑流程显示 */}
      {showCategory && (
        <Select
          value={draft.category}
          onValueChange={(v) => onChange("category", v as ExpenseCategory)}
        >
          <SelectTrigger id="expense-category" size="lg" className="w-full">
            <span className={FIELD_LABEL}>类别</span>
            <TriggerValue />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                <CategoryIcon
                  category={category}
                  className="mr-2 size-4 text-gray-600"
                />
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* 付款人：至少有「我」，下拉不会是空的 */}
      <Select value={draft.paidBy} onValueChange={(v) => onChange("paidBy", v)}>
        <SelectTrigger id="expense-payer" size="lg" className="w-full">
          <span className={FIELD_LABEL}>付款人</span>
          <TriggerValue placeholder="选择付款人" />
        </SelectTrigger>
        <SelectContent>
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              <MemberAvatar member={member} />
              {/*
                truncate 写在被克隆的这一侧 —— 类名跟着节点一起 portal 进值那一格。
                min-w-0 不能省：flex 项默认 min-width:auto，不加的话名字比格子宽时
                是顶出去而不是出省略号。
              */}
              <span className="ml-2 min-w-0 truncate">
                {member.displayName}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/*
        分摊：头行、成员勾选、底部合计同住一张卡（参照物是个整体卡片，中间一条
        分隔线）。只有选了「分摊给多人」才长出下面两段，否则这张卡就是一行下拉。
      */}
      <div className="rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <Select
          value={isSplit ? "split" : "none"}
          onValueChange={(v) => toggleSplit(v === "split")}
        >
          <SelectTrigger
            id="expense-split"
            size="lg"
            /*
             * 边框和 focus ring 都交给外面这张卡（focus-within 那两条），
             * 否则框里会出现第二条边和一个贴边的光圈。
             */
            className="w-full border-0 focus-visible:ring-0"
          >
            <span className={FIELD_LABEL}>分摊</span>
            <TriggerValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">不分摊</SelectItem>
            <SelectItem value="split">分摊给多人</SelectItem>
          </SelectContent>
        </Select>

        {isSplit && (
          <>
            <div className="px-2 pb-2">
              {members.map((member) => (
                <label
                  key={member.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 hover:bg-gray-50"
                >
                  <Checkbox
                    checked={draft.splitWith.includes(member.id)}
                    onCheckedChange={(checked) =>
                      toggleMember(member.id, checked === true)
                    }
                  />
                  <MemberAvatar member={member} />
                  <span className="truncate text-sm">{member.displayName}</span>
                </label>
              ))}
            </div>

            <Separator />

            <div className="flex items-center justify-between px-2.5 py-2">
              <span className="text-sm font-semibold text-gray-700">
                {perPerson ? `${perPerson}/人` : "—"}
              </span>
              <span className="text-sm text-gray-500">
                {draft.splitWith.length} 人
              </span>
            </div>
          </>
        )}
      </div>

      {/* 日期：可选。不在框里，就是一行「日期  值  ▾」（参照物如此） */}
      <div className="space-y-1">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left transition-colors hover:bg-gray-50"
            >
              <span className={FIELD_LABEL}>日期</span>
              <span
                className={cn(
                  "ml-auto text-sm",
                  draft.date ? "text-gray-900" : "text-gray-400",
                )}
              >
                {draft.date || "可选"}
              </span>
              {/* 日历图标不放了：框里已经有「日期」这个标签，图标是重复的 */}
              <ChevronDown className="size-4 shrink-0 text-gray-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={
                draft.date ? new Date(`${draft.date}T00:00:00`) : undefined
              }
              onSelect={(picked) =>
                onChange("date", picked ? format(picked, "yyyy-MM-dd") : "")
              }
              locale={zhCN}
            />
          </PopoverContent>
        </Popover>
        {draft.date && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto gap-1 p-0 text-xs text-gray-400 hover:bg-transparent hover:text-gray-700"
            onClick={() => onChange("date", "")}
          >
            <X className="size-3" />
            清除日期
          </Button>
        )}
      </div>
    </div>
  );
}
