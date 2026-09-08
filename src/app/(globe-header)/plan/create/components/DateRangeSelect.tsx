"use client";

import { useFormContext } from "react-hook-form";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";
import { type DateRange } from "react-day-picker";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import DateRangePicker from "@/components/DateRangePicker";

export default function DateRangeSelect() {
  const form = useFormContext();
  const [date, setDate] = useState<DateRange | undefined>();

  // 同步到表单
  const handleDateChange = (selectedDate: DateRange | undefined) => {
    setDate(selectedDate);
    form.setValue("startDate", selectedDate?.from);
    form.setValue("endDate", selectedDate?.to);
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <FormField
        control={form.control}
        name="startDate"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>日期（可选）</FormLabel>
            <DateRangePicker value={date} onChange={handleDateChange} />
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
