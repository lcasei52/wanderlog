"use client";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type DateRange } from "react-day-picker";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

type DateRangeProps = {
  value?: DateRange;
  onChange?: (data: DateRange | undefined) => void;
};

export default function DateRangePicker({ value, onChange }: DateRangeProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full h-12 pl-3 text-left font-normal justify-start",
            !value?.from && "text-gray-500",
          )}
        >
          {value?.from ? (
            value.to ? (
              <span className="text-gray-900">
                {format(value.from, "yyyy年M月d日", { locale: zhCN })} -{" "}
                {format(value.to, "yyyy年M月d日", { locale: zhCN })}
              </span>
            ) : (
              <span className="text-gray-900">
                {format(value.from, "yyyy年M月d日", { locale: zhCN })}
              </span>
            )
          ) : (
            <span>选择日期范围</span>
          )}
          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={value?.from}
          selected={value}
          onSelect={onChange}
          numberOfMonths={2}
          locale={zhCN}
        />
      </PopoverContent>
    </Popover>
  );
}
