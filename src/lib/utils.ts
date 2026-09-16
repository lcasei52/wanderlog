import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 两个对象逐字段（浅层）相等？
 *
 * 给表单草稿用：源头那一行换了对象、字段却没变的情况很常见 —— 拖动排序会为了写回
 * position 把整列的行对象都重建一遍 —— 那时不该把草稿重置掉、白擦用户还没保存的输入。
 * 只适用于字段都是原始值、两边字段集合一致的小草稿（航班/住宿的编辑表单就是）。
 */
export function sameFields<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  );
}

/**
 * 可选币种。符号显示和「选币种」下拉共用这一份 —— 以前符号表是私有的、
 * 下拉里另写了 5 个，两边对不上：表能显示的币种比能选的还多。
 */
export const CURRENCY_OPTIONS = [
  { code: "CNY", name: "人民币", symbol: "¥" },
  { code: "USD", name: "美元", symbol: "$" },
  { code: "EUR", name: "欧元", symbol: "€" },
  { code: "GBP", name: "英镑", symbol: "£" },
  { code: "JPY", name: "日元", symbol: "¥" },
  { code: "HKD", name: "港元", symbol: "HK$" },
  { code: "KRW", name: "韩元", symbol: "₩" },
  { code: "THB", name: "泰铢", symbol: "฿" },
  { code: "SGD", name: "新加坡元", symbol: "S$" },
  { code: "AUD", name: "澳元", symbol: "A$" },
] as const;

/** 常见币种符号。表里没有的币种原样显示代码 —— 总比张冠李戴显示个 ¥ 强 */
const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  CURRENCY_OPTIONS.map((c) => [c.code, c.symbol]),
);

export function currencySymbol(currency?: string | null): string {
  const code = (currency || "CNY").toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? code;
}

/** 金额展示：币种符号 + 千分位 + 两位小数 */
export function formatCurrency(amount: number, currency?: string | null): string {
  return `${currencySymbol(currency)}${amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
