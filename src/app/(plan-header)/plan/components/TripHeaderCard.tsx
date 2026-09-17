"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon, UserPlus } from "lucide-react";
import { toast } from "sonner";
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
import { updateTripName } from "@/actions/trips";
import { useMembers } from "@/context/members-context";
import { MemberAvatarStack } from "@/components/MemberAvatar";
import AddMemberDialog from "./overview/AddMemberDialog";

interface TripHeaderCardProps {
  dateRange?: DateRange;
  onDateRangeChange?: (dateRange: DateRange | undefined) => void;
  /** 行程名（来自数据库），用于初始化标题 */
  initialTitle?: string;
  /** 行程 id。不传就只能改本地（组件本身可以脱离数据库单独摆着看） */
  tripId?: string;
}

export default function TripHeaderCard({
  dateRange: externalDateRange,
  onDateRangeChange,
  initialTitle,
  tripId,
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

  /** 库里那个名字（拿不到 trip.name 时的兜底文案只有这一个来源） */
  const savedTitle = initialTitle ?? "新的旅行";
  const [title, setTitle] = useState(savedTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  /** 行程成员（含「我」那一行），右下角那一摞头像和「添加伙伴」都取自这里 */
  const { members } = useMembers();

  /*
   * 保存成功后 action 里的 revalidatePath 会让服务端重渲染，initialTitle 换成新名字；
   * 这个 effect 负责把输入框这边对齐（最明显的是首尾空格被 trim 掉的情况）。
   * 依赖是个字符串，值没变就不会触发 —— 打字过程中它不会来擦用户正在输的内容。
   */
  useEffect(() => {
    setTitle(savedTitle);
  }, [savedTitle]);

  /** Escape 之后 input 会被卸载，用它挡住可能跟着来的那次 blur（见下） */
  const cancelledRef = useRef(false);

  /**
   * 提交只有这一条路径：Enter / 点别处都先让 input 失焦，落到 onBlur 上。
   *
   * 为什么不把 Enter 也写成"直接提交"：Enter 之后 setState 会把 input 卸载，
   * 卸载那一刻还可能补一次 blur —— 两个入口就是两次提交、两次写库。
   */
  const handleTitleSubmit = async () => {
    // Escape 是"放弃"，不能顺着 onBlur 这条路走到保存上去
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }

    setIsEditingTitle(false);

    const next = title.trim();
    /*
     * 两种情况都不写库：清空了（name 是 notNull，后端也会抛），
     * 或者根本没改（一趟到 Neon 往返一两秒，白等）。两种都把显示改回库里那个值。
     */
    if (!next || next === savedTitle || !tripId) {
      setTitle(savedTitle);
      return;
    }

    try {
      await updateTripName(tripId, next);
      // 不手动 setTitle：revalidatePath 回来的新 initialTitle 会被上面的 effect 对齐
      toast.success("行程名已更新");
    } catch (error) {
      // 没写进库就别在页面上留着新名字 —— 那等于页面在撒谎
      setTitle(savedTitle);
      toast.error("重命名失败，请重试");
      console.error("Failed to update trip name:", error);
    }
  };

  const startEditingTitle = () => {
    cancelledRef.current = false; // 清掉上一次 Escape 留下的标记
    setIsEditingTitle(true);
  };

  return (
    <>
      <Card className="bg-white shadow-lg p-6 relative">
        {/* 标题 - 可编辑 */}
        {isEditingTitle ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // 走 onBlur，别在这里另开一条提交路径
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                cancelledRef.current = true;
                setTitle(savedTitle); // 放弃这次改动，重新进来是库里那个名字
                setIsEditingTitle(false);
              }
            }}
            className="h-auto text-4xl font-bold text-gray-900 mb-4 border-0 border-b-2 border-orange-500 rounded-none px-0 py-0 focus-visible:ring-0"
            autoFocus
          />
        ) : (
          <h1
            className="text-4xl font-bold text-gray-900 mb-4 cursor-pointer hover:text-orange-600 transition-colors"
            onClick={startEditingTitle}
            title="点击编辑标题"
          >
            {title}
          </h1>
        )}

        <div className="flex items-center justify-between">
          {/* 左侧：日期选择 */}
          <Popover>
            <PopoverTrigger asChild>
              {/*
                ghost 而不是 outline：这一行不要"框子" —— 日期是次要信息，
                画个框会跟上面的大标题抢。浅灰 + font-black 是拿字重换颜色：
                颜色压到次要那一档，靠加粗保证还看得清。
                -ml-2.5 抵掉按钮自己的左内边距：框子去掉之后，那 10px 就成了
                肉眼可见的缩进，跟上面标题的左边缘对不上。
              */}
              <Button
                variant="ghost"
                className="-ml-2.5 flex items-center gap-2 text-sm font-black text-gray-400"
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

          {/* 右侧：成员头像 + 添加伙伴 */}
          <div className="flex items-center gap-2">
            {/*
              成员来自 MembersProvider（TripWorkspace 把它包在 DetailContent 外面）。
              「我」就是 members[0]（见 db/trip-members.ts 的 SELF_MEMBER_NAME），
              所以这一摞里天然有自己 —— 不用再单画一个写死「我」的圆。
              size 用 default（32px）而不是费用卡那里的 sm（24px）：这一行旁边
              站着一个 h-8 的图标按钮，24px 会显小。
            */}
            <MemberAvatarStack members={members} size="default" />

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              title="添加伙伴"
              onClick={() => setShowAddMember(true)}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* 跟预算卡右侧那个「添加伙伴」是同一个弹窗，成员也共用一个 MembersProvider */}
      <AddMemberDialog open={showAddMember} onOpenChange={setShowAddMember} />
    </>
  );
}
