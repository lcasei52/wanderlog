"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ListShellProps {
  /** 供 BookingCard 滚动的锚点 id（如 "list-flights"） */
  anchorId?: string;
  title: string;
  /** 允许点标题改名（传 onRename 时启用） */
  onRename?: (nextTitle: string) => void;
  /** 提供则标题行尾出现「删除」菜单 */
  onDelete?: () => void;
  /** 提供则标题行尾出现「更换颜色」菜单（点开调色弹窗；只有地点列表给） */
  onChangeColor?: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children?: ReactNode;
}

/**
 * 概览区各列表（Notes/Flights/Trains/Hotels/地点列表）共用的外壳：
 * 折叠箭头 + 可改名标题 + 「···」菜单（换颜色 / 删除）+ 内容区。
 * 展开/收起的切换与标题改名都由这里实现，内容由子组件（ListShell 的 children）渲染。
 *
 * 「···」按钮的显示条件是"这两个动作至少给了一个" —— 只给 onRename 的那几个
 * （Notes/Flights/Trains/Hotels）就照旧没有这个按钮，给 onDelete 或 onChangeColor
 * 的才有。地点列表两个都给。
 */
export default function ListShell({
  anchorId,
  title,
  onRename,
  onDelete,
  onChangeColor,
  expanded,
  onExpandedChange,
  children,
}: ListShellProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);

  /*
   * 草稿要跟着源头走（撤销把标题改回去时，再点开编辑框得是撤销后那个标题）。
   *
   * 但**只在源头真的变了的时候**才重置：`renamePlaceList` 不是乐观更新，是按服务器
   * 回来的行改 state，所以提交后的那一两秒里 `title` 还是旧值 —— 照着它重置会把用户
   * 刚打的新标题擦掉。这里盯的是"title 这个值变了没"，而不是"渲染了几次"，自己那次
   * 改名的回音（旧值→新值）落下来时草稿本来就等于新值，重置也不会闪。
   */
  const lastSourceTitleRef = useRef(title);
  useEffect(() => {
    if (title === lastSourceTitleRef.current) return;
    lastSourceTitleRef.current = title;
    if (!isEditingTitle) setDraftTitle(title);
  }, [title, isEditingTitle]);

  const submitTitle = () => {
    setIsEditingTitle(false);
    const next = draftTitle.trim() || title;
    setDraftTitle(next);
    if (next !== title) onRename?.(next);
  };

  return (
    <div id={anchorId} className="scroll-mt-4">
      {/*
        标题行。手机上 px-3（12px）：这一层和下面的内容区一起决定了"卡片离卡片盒左/右沿
        多远"，缩它是"手机不留白"的主要一环。
        展开箭头就从这 12px 起 —— 它和行程里 DayCard 的箭头本来对齐在 24px，现在两边
        一起变成 12px（DayCard 那边整张卡就是 px-3，头部不用再挂负边距），仍旧对齐。
      */}
      <div className="flex items-center gap-2 py-5 px-3 lg:px-6">
        {/* 展开/收起箭头 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onExpandedChange(!expanded)}
          aria-label={expanded ? "收起" : "展开"}
        >
          {expanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </Button>

        {/* 标题 - 可编辑 */}
        {isEditingTitle ? (
          <Input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={submitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitTitle();
              else if (e.key === "Escape") {
                setIsEditingTitle(false);
                setDraftTitle(title);
              }
            }}
            className="flex-1 h-auto text-xl font-semibold border-0 border-b-2 border-blue-500 rounded-none px-0 py-0 focus-visible:ring-0"
            autoFocus
          />
        ) : (
          <h4
            className="flex-1 text-xl font-semibold text-gray-900 truncate"
            onClick={() => onRename && setIsEditingTitle(true)}
            role={onRename ? "button" : undefined}
            title={onRename ? "点击改名" : undefined}
          >
            {draftTitle}
          </h4>
        )}

        {/* 更多选项菜单（能换色或能删除的列表才显示；正在改名时不显示） */}
        {(onDelete || onChangeColor) && !isEditingTitle && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onChangeColor && (
                <DropdownMenuItem onClick={onChangeColor}>更换颜色</DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={onDelete}
                >
                  删除列表
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/*
        展开的内容。手机上是 px-3 —— **左右一样**的 12px：内容左沿正好落在上面那行
        标题的展开箭头上（标题行也是 px-3，箭头就占 12..36），离两边一样远。
        以前这里多挂一个 pl-10（40px，为的是对齐标题**文字**），于是左边 40px、
        右边 12px 的差在 375px 上看得出来，去掉了。

        lg 以上保留 pl-14（56px）：桌面不缺那点宽度，内容缩到标题文字下面更好读。
        ★ 手机这一套跟 DetailContent 里「+ 新列表」那一行、以及 ListDivider 的
        left-1（+ 号落在 12px）是同一套数，改这里要一起改（三处都写了 lg: 前后两套）。
      */}
      {expanded && <div className="px-3 pb-5 lg:px-6 lg:pl-14">{children}</div>}
    </div>
  );
}
