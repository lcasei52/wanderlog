import type {
  Expense as SchemaExpense,
  NewExpense as SchemaNewExpense,
} from "@/db/schema";
import {
  BedDouble,
  Car,
  ClipboardList,
  Fuel,
  PartyPopper,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  TrainFront,
  Utensils,
  type LucideIcon,
} from "lucide-react";

export type Expense = SchemaExpense;
export type NewExpense = SchemaNewExpense;

/** 费用类别枚举（11个固定类别） */
export const EXPENSE_CATEGORIES = [
  "航班",
  "住宿",
  "租车",
  "公共交通",
  "餐饮",
  "门票",
  "活动",
  "购物",
  "油费",
  "杂货",
  "其他",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * 类别图标映射（用于 UI 显示）。值是 lucide 组件本身，不是 JSX —— 这个文件是
 * .ts，放不了 JSX，渲染交给 <CategoryIcon>（它顺手兜住"库里存了不认识的类别"）。
 *
 * 为什么从 emoji 换成线性图标：emoji 每一个都自带一套配色（✈️ 是蓝的、🎫 是黄的、
 * 🎉 是彩的），十几个摆在一屏里必然打架，而且颜色完全不受控。线性图标统一描边、
 * 颜色由外层的 text-* 决定，"和谐"才谈得上。
 */
export const CATEGORY_ICONS: Record<ExpenseCategory, LucideIcon> = {
  航班: Plane,
  住宿: BedDouble,
  租车: Car,
  公共交通: TrainFront,
  餐饮: Utensils,
  门票: Ticket,
  活动: PartyPopper,
  购物: ShoppingBag,
  油费: Fuel,
  杂货: ShoppingCart,
  其他: ClipboardList,
};

/** 创建费用时的输入 */
export interface ExpenseInput {
  amount: number;
  currency?: string; // 默认 CNY
  category: ExpenseCategory;
  name: string;
  description?: string | null;
  date?: string | null; // "YYYY-MM-DD"
  paidBy: string; // member id
  splitWith: string[]; // member ids[], 空数组=不分摊
  linkedItemType?: string | null;
  linkedItemId?: string | null;
}

/** 更新费用时的补丁 */
export interface ExpensePatch {
  amount?: number;
  currency?: string;
  category?: ExpenseCategory;
  name?: string;
  description?: string | null;
  date?: string | null;
  paidBy?: string;
  splitWith?: string[];
  linkedItemType?: string | null;
  linkedItemId?: string | null;
  position?: number;
}

/** 团队结算计算结果 */
export interface BalanceSummary {
  memberId: string;
  memberName: string;
  totalPaid: number; // 该成员支付的总额
  totalOwed: number; // 该成员应分摊的总额
  balance: number; // 净余额（正=别人欠他，负=他欠别人）
}

/** 成员间的欠款关系 */
export interface DebtRelation {
  fromId: string; // 欠款人
  fromName: string;
  toId: string; // 被欠人
  toName: string;
  amount: number;
}
