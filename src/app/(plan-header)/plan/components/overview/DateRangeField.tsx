"use client";

import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * 「入住 - 退房」这类日期区间选择器。添加住宿的弹窗和住宿卡展开后的表单是同一格，
 * 抽出来免得两处各写一遍（连带 zhCN 的格式串和行程范围禁选）。
 *
 * 注意 mode="range" 的 onSelect 会先给 `{ from: 某天, to: undefined }`（只点了第一天），
 * 所以调用方必须能接受半截区间。
 */
export default function DateRangeField({
  value,
  onChange,
  disabled,
  fallbackMonth,
  placeholder = "选择入住和退房日期",
  size = "sm",
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  /** 行程日期范围，超出的一律禁选 */
  disabled?: { before: Date; after: Date };
  /** 一个日期都没选时，日历打开到哪个月 */
  fallbackMonth?: Date;
  placeholder?: string;
  /** sm 配 h-8 的紧凑表单（住宿卡展开态），default 配 h-9 的弹窗表单 */
  size?: "sm" | "default";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value?.from && "text-gray-400"
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {value?.from ? (
              <>
                {format(value.from, "M月d日", { locale: zhCN })}
                {" - "}
                {value.to ? (
                  format(value.to, "M月d日", { locale: zhCN })
                ) : (
                  // 半截状态（只点了入住日）要说出来，否则看着像没点中
                  <span className="text-gray-400">选择退房日</span>
                )}
              </>
            ) : (
              placeholder
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          disabled={disabled}
          defaultMonth={value?.from ?? fallbackMonth}
          numberOfMonths={2}
          locale={zhCN}
        />
      </PopoverContent>
    </Popover>
  );
}
