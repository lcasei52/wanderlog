"use client";

import type { ReactNode } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, parse } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";

/**
 * 表单里的两个通用小件：一格（小标签 + 控件）和日期选择器。
 *
 * 为什么抽出来：航班表单和火车表单都要它们，而以前这类东西是"私有副本 + 各写一份"
 * 的（符号表那次就是这么分叉的：下拉里另写了 5 个）。抽一份的成本只有 import，
 * 分叉的成本是两处慢慢长得不一样。
 *
 * 两者**只是搬运**，prop 名和 DOM 都没动 —— 航班那边的调用点因此一个字都不用改。
 */

/** 表单里的一格：小标签 + 控件 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-normal text-gray-500">{label}</Label>
      {children}
    </div>
  );
}

/**
 * "yyyy-MM-dd" 字符串 ⇄ Date 的日期选择器（可传行程范围限制可选日）。
 * 必须走 date-fns 的 parse：new Date("2024-09-24") 是按 UTC 解析的，
 * 时区一偏就整天错位；parse 按本地时区，取回来还是同一天。
 */
export function DateField({
  value,
  onChange,
  disabled,
  fallbackMonth,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: { before: Date; after: Date };
  fallbackMonth?: Date;
}) {
  const selected = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-gray-400"
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {selected
              ? format(selected, "yyyy年M月d日", { locale: zhCN })
              : "选择日期"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : "")}
          disabled={disabled}
          defaultMonth={selected ?? fallbackMonth}
          numberOfMonths={2}
          locale={zhCN}
        />
      </PopoverContent>
    </Popover>
  );
}
