"use client";

import { useState } from "react";
import { Calendar as CalendarIcon, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type DateRange } from "react-day-picker";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface TripHeaderCardProps {
  dateRange?: DateRange;
  onDateRangeChange?: (dateRange: DateRange | undefined) => void;
  /** 行程名（来自数据库），用于初始化标题 */
  initialTitle?: string;
}

export default function TripHeaderCard({
  dateRange: externalDateRange,
  onDateRangeChange,
  initialTitle,
}: TripHeaderCardProps) {
  const [internalDateRange, setInternalDateRange] = useState<DateRange | undefined>({
    from: new Date(2024, 2, 15), // 3月15日
    to: new Date(2024, 2, 20), // 3月20日
  });

  const dateRange = externalDateRange !== undefined ? externalDateRange : internalDateRange;
  const setDateRange = (range: DateRange | undefined) => {
    if (onDateRangeChange) {
      onDateRangeChange(range);
    } else {
      setInternalDateRange(range);
    }
  };

  const [title, setTitle] = useState(initialTitle ?? "新的旅行");
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    // 后续在这里调用 API 保存标题
  };

  return (
    <Card className="bg-white shadow-lg p-6 relative">
      {/* 标题 - 可编辑 */}
      {isEditingTitle ? (
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleTitleSubmit();
            } else if (e.key === "Escape") {
              setIsEditingTitle(false);
            }
          }}
          className="h-auto text-2xl font-bold text-gray-900 mb-4 border-0 border-b-2 border-orange-500 rounded-none px-0 py-0 focus-visible:ring-0"
          autoFocus
        />
      ) : (
        <h1
          className="text-2xl font-bold text-gray-900 mb-4 cursor-pointer hover:text-orange-600 transition-colors"
          onClick={() => setIsEditingTitle(true)}
          title="点击编辑标题"
        >
          {title}
        </h1>
      )}

      <div className="flex items-center justify-between">
        {/* 左侧：日期选择 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="flex items-center gap-2 text-sm"
            >
              <CalendarIcon className="h-4 w-4" />
              <span>
                {dateRange?.from && dateRange?.to
                  ? `${format(dateRange.from, "M月d日", { locale: zhCN })} - ${format(dateRange.to, "M月d日", { locale: zhCN })}`
                  : "选择日期"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={setDateRange}
              numberOfMonths={2}
              locale={zhCN}
            />
          </PopoverContent>
        </Popover>

        {/* 右侧：用户头像和添加按钮 */}
        <div className="flex items-center gap-2">
          {/* 当前用户头像 */}
          <div className="h-8 w-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-medium">
            我
          </div>

          {/* 添加用户按钮 */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            title="添加协作者"
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
