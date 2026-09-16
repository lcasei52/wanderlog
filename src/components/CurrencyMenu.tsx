"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CURRENCY_OPTIONS, currencySymbol, cn } from "@/lib/utils";

interface CurrencyMenuProps {
  value: string;
  onChange: (code: string) => void;
  /** 触发按钮的额外类名 —— 各处的框高和字号不一样，样式留给调用方 */
  triggerClassName?: string;
}

/**
 * 「点一下就换币种」的那个符号。触发按钮显示的是**当前币种的符号**
 * （currencySymbol 兜底成币种代码，所以表外币种显示 "CHF" 这样的字样），
 * 所以换完之后这个 ¥ 会跟着变成 $ / €。
 *
 * 支出和预算两处都用它，免得币种列表和显示规则各写一份。
 */
export default function CurrencyMenu({
  value,
  onChange,
  triggerClassName,
}: CurrencyMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="选择币种"
          className={cn(
            "flex cursor-pointer items-center gap-0.5 rounded font-medium text-gray-700 transition-colors hover:text-gray-900",
            triggerClassName,
          )}
        >
          {currencySymbol(value)}
          <ChevronDown className="size-3.5 text-gray-400" />
        </button>
      </DropdownMenuTrigger>
      {/*
       * 默认宽度是 --radix-dropdown-menu-trigger-width（跟着那个符号按钮，
       * 只有十几像素），这里改成按内容撑开。
       */}
      <DropdownMenuContent align="start" className="w-auto min-w-44">
        {CURRENCY_OPTIONS.map((c) => (
          <DropdownMenuItem key={c.code} onSelect={() => onChange(c.code)}>
            <span className="w-7 shrink-0 text-gray-500">{c.symbol}</span>
            <span>{c.name}</span>
            <span className="ml-auto text-xs text-gray-400">{c.code}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
