"use client";

import { useRef, useState, type ComponentType } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Hotel,
  Map,
  MapPin,
  Plane,
  Sparkles,
  StickyNote,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { TripSummary } from "@/types/trip";
import { usePlaces } from "@/context/places-context";

interface SubItem {
  id: string; // 锚点 id，点击/高亮都用它
  label: string;
  icon: ComponentType<{ className?: string }>;
  count?: number;
}

interface SimpleSidebarProps {
  trip?: TripSummary;
  /** 当前阅读位置所在的大类 id（overview / itinerary / budget） */
  activeSection?: string | null;
  /** 当前阅读位置所在的小标题锚点 id（list-* / day-*）；无则 null */
  activeSubId?: string | null;
  /** 点击 AI 助手按钮的回调 */
  onAiClick?: () => void;
}

/** 平滑滚到详情页里的某个锚点（block:start，锚点自带 scroll-mt 留白） */
const scrollTo = (id: string) =>
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });

/**
 * 侧边栏 = 详情页的目录（scrollspy TOC）：
 * 三个大组（概览/行程/预算），正在看的大类标题 → 黑底白字块；
 * 大类下的小标题（概览=list 块、行程=每天），正在看的那个 → 黑字高亮，其余灰色。
 * 点大标题滚到大节、点小标题滚到对应列表/某天。
 */
export default function SimpleSidebar({
  trip,
  activeSection,
  activeSubId,
  onAiClick,
}: SimpleSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({
    overview: true,
    itinerary: true,
    budget: false,
  });
  const { placeLists, days, listItems, dayItemsByDate } = usePlaces();

  // 两层内容各一个 ref：切换折叠时用来判断焦点是不是落在"即将被隐藏的那一层"里
  const expandedLayerRef = useRef<HTMLDivElement>(null);
  const collapsedLayerRef = useRef<HTMLDivElement>(null);
  // 两个切换按钮，焦点被搬走时的落脚点
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);

  const toggleGroup = (key: string) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  /**
   * 切换折叠。
   * 不能只 setIsCollapsed：即将隐藏的那一层会变成 inert，浏览器会把层内的焦点
   * **强制弹回 <body>** —— 键盘用户按一下按钮就丢失了位置。所以只在焦点确实落在
   * "即将被隐藏的那一层"里时，把它搬到对面那个切换按钮上。
   * 程序化 focus() 不算 :focus-visible，鼠标用户不会平白多出一圈焦点环。
   */
  const toggleCollapsed = (next: boolean) => {
    const active = document.activeElement;
    const hiding = next ? expandedLayerRef.current : collapsedLayerRef.current;
    const needsRefocus = !!active && !!hiding && hiding.contains(active);

    setIsCollapsed(next);

    if (needsRefocus) {
      // 用 rAF 等这次点击的任务（含 React 的提交）走完：那时 inert 已经写到 DOM 上，
      // 此刻再 focus() 才不会被浏览器当场弹开。
      requestAnimationFrame(() =>
        (next ? expandButtonRef : collapseButtonRef).current?.focus(),
      );
    }
  };

  // 概览下的固定三块 + 各地点列表（标题跟随改名，锚点用 list.id）
  const overviewSubs: SubItem[] = [
    { id: "list-notes", label: "Notes", icon: StickyNote },
    { id: "list-flights", label: "Flights", icon: Plane },
    { id: "list-hotels", label: "Hotels", icon: Hotel },
    ...placeLists.map((l) => ({
      id: `list-${l.id}`,
      label: l.title,
      icon: MapPin,
      count: listItems(l.id).length,
    })),
  ];
  // 行程下的每天（Day N · M月d日）
  const itinerarySubs: SubItem[] = days.map((d) => ({
    id: `day-${d.dayDate}`,
    label: `Day ${d.dayNumber} · ${d.label}`,
    icon: CalendarDays,
    count: dayItemsByDate(d.dayDate).length,
  }));

  const groups: {
    key: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    subs: SubItem[];
  }[] = [
    { key: "overview", label: "概览", icon: Compass, subs: overviewSubs },
    { key: "itinerary", label: "行程", icon: Map, subs: itinerarySubs },
    { key: "budget", label: "预算", icon: Wallet, subs: [] },
  ];

  /*
   * 展开态和折叠态是**同一个 <aside> 里的两层**，不再各写一个 return。
   *
   * 以前是 `if (isCollapsed) return (...)` / `return (...)` 两个分支，也就是两份
   * 完全独立的 DOM 树 —— 切换时 React 把一份整棵删掉、另一棵整棵新建，中间没有任何
   * "同一个元素"可以让浏览器插值，所以宽度只能瞬变，加多少 transition 都不会动。
   *
   * 现在的做法：唯一的 <aside> 负责宽度过渡（w-56 ⇄ w-12），原本两份内容都留在里面，
   * 各自绝对定位、叠在一起，靠 opacity 交叉淡入淡出。外层 overflow-hidden 配上
   * **内层固定宽度**（w-56 / w-12 写死，绝不能改成 w-full），展开时就是像拉窗帘一样
   * 把内容逐步"露"出来 —— 是滑，不是压扁（内容不跟着父级每帧重排）。
   */
  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "relative h-full shrink-0 overflow-hidden border-r bg-white",
          "transition-[width] duration-200 ease-out motion-reduce:transition-none",
          isCollapsed ? "w-12" : "w-56",
        )}
      >
        {/*
          展开层。
          inert：整层从 Tab 序和无障碍树里摘掉，同时关掉它的焦点与命中测试。
          opacity-0 / overflow-hidden 都做不到这一点 —— 元素还在 Tab 序里，
          键盘用户 Tab 半天会停在看不见的按钮上。所以 inert 是必需品，不是保险。
          （pointer-events-none 也不能省：opacity-0 仍然吃点击，而折叠层在 DOM 里
          靠后，不关掉它会盖住展开层左侧 48px，变成隐形按钮吞点击。）
        */}
        <div
          ref={expandedLayerRef}
          inert={isCollapsed}
          className={cn(
            "absolute inset-y-0 left-0 w-56 flex flex-col transition-opacity duration-200 motion-reduce:transition-none",
            isCollapsed ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
          {/* 顶部：AI助手 */}
          <div className="p-3 border-b">
            <Button
              onClick={onAiClick}
              className="w-full bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white rounded-full flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all"
            >
              <Sparkles className="h-4 w-4" />
              <span className="font-medium">AI 助手</span>
            </Button>
          </div>

          {/* 中间：目录树（自己可滚动） */}
          <nav className="flex-1 overflow-y-auto py-2">
            {groups.map((g) => {
              const bigActive = activeSection === g.key;
              return (
                <div key={g.key} className="py-0.5">
                  {/* 大标题行：当前大类 = 黑底白字块；否则透明、hover 浅灰 */}
                  <div
                    className={cn(
                      "mx-2 flex items-center rounded-lg transition-colors",
                      bigActive ? "bg-gray-900" : "hover:bg-gray-100",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => scrollTo(g.key)}
                      className="flex-1 flex items-center min-w-0 py-2 pl-3 pr-1 text-left"
                    >
                      <span
                        className={cn(
                          "text-xl font-bold tracking-wide",
                          bigActive ? "text-white" : "text-gray-900",
                        )}
                      >
                        {g.label}
                      </span>
                    </button>
                    {g.subs.length > 0 && (
                      <button
                        type="button"
                        aria-label={
                          open[g.key] ? `收起${g.label}` : `展开${g.label}`
                        }
                        aria-expanded={open[g.key]}
                        onClick={() => toggleGroup(g.key)}
                        className={cn(
                          "py-2 pl-1 pr-2 transition-colors",
                          bigActive
                            ? "text-white/80 hover:text-white"
                            : "text-gray-400 hover:text-gray-700",
                        )}
                      >
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            open[g.key] && "rotate-180",
                          )}
                        />
                      </button>
                    )}
                  </div>

                  {/*
                    小标题列表：正在看的黑字高亮，其余灰色。
                    不再用 {open && ...} 条件渲染 —— 元素进出 DOM 时没有可过渡的中间态，
                    只能瞬变。改成常挂 + grid-rows 0fr↔1fr：外层那一行的高度从 0 长到 1fr，
                    就是一次纯 CSS 的高度过渡。
                    代价：收起时 ul 只是被裁掉（仍在 DOM 里），里面的按钮还能被 Tab 到，
                    所以补 inert 把整棵子树摘出 Tab 序和无障碍树；不能用 hidden/display:none，
                    那会直接把过渡干掉。

                    注意 g.subs.length > 0 要单独留着：预算是空数组，丢了它会渲染一个空 ul。
                  */}
                  {g.subs.length > 0 && (
                    <div
                      inert={!open[g.key]}
                      className={cn(
                        "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                        open[g.key] ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                      )}
                    >
                      {/*
                        overflow-hidden 是这套写法成立的另一半：grid item 的"自动最小尺寸"
                        只在 overflow 为 visible 时才是内容高度，非 visible 时为 0，
                        0fr 那一行才真的塌得下去（所以不需要 min-h-0）。
                      */}
                      <ul className="overflow-hidden mt-1 mb-1.5 space-y-0.5 px-2">
                        {g.subs.map((s) => {
                          const subActive = bigActive && activeSubId === s.id;
                          return (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() => scrollTo(s.id)}
                                className={cn(
                                  "w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-base transition-colors",
                                  subActive
                                    ? "bg-gray-100 text-gray-900 font-semibold"
                                    : "text-gray-400 hover:bg-gray-50 hover:text-gray-700",
                                )}
                              >
                                <s.icon
                                  className={cn(
                                    "h-3.5 w-3.5 shrink-0",
                                    subActive
                                      ? "text-gray-700"
                                      : "text-gray-300",
                                  )}
                                />
                                <span className="truncate flex-1">
                                  {s.label}
                                </span>
                                {s.count != null && s.count > 0 && (
                                  <span className="text-xs text-gray-400 tabular-nums shrink-0">
                                    {s.count}
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* 底部：隐藏侧边栏 */}
          <div className="p-4 border-t">
            <Button
              ref={collapseButtonRef}
              variant="ghost"
              size="sm"
              onClick={() => toggleCollapsed(true)}
              className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>隐藏侧边栏</span>
            </Button>
          </div>
        </div>

        {/* 折叠层：图标轨。同上，固定 w-12 */}
        <div
          ref={collapsedLayerRef}
          inert={!isCollapsed}
          className={cn(
            "absolute inset-y-0 left-0 w-12 flex flex-col transition-opacity duration-200 motion-reduce:transition-none",
            isCollapsed ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {/* AI 助手 */}
          <div className="flex items-center justify-center p-2 border-b">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onAiClick}
                  size="icon"
                  className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white shadow-md hover:shadow-lg transition-all"
                >
                  <Sparkles className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                AI 助手
              </TooltipContent>
            </Tooltip>
          </div>

          {/* 折叠态目录 */}
          <nav className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-1">
            {groups.map((g) => {
              const bigActive = activeSection === g.key;
              return (
                <div key={g.key} className="flex flex-col items-center">
                  {/* 大类图标 */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => scrollTo(g.key)}
                        className={cn(
                          "h-8 w-8 flex items-center justify-center rounded-md transition-colors",
                          bigActive
                            ? "bg-gray-900 text-white"
                            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
                        )}
                      >
                        <g.icon className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {g.label}
                    </TooltipContent>
                  </Tooltip>

                  {/* 子项 */}
                  {g.subs.length > 0 && (
                    <div className="flex flex-col items-center gap-0.5 my-1">
                      {g.subs.map((s) => {
                        const subActive = bigActive && activeSubId === s.id;

                        // 行程子项：显示月/日小组合
                        if (g.key === "itinerary") {
                          const dayDate = s.id.replace("day-", "");
                          const [, month, day] = dayDate.split("-");
                          return (
                            <Tooltip key={s.id}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => scrollTo(s.id)}
                                  className={cn(
                                    "flex flex-col items-center justify-center h-9 w-9 rounded-md text-center leading-none transition-colors",
                                    subActive
                                      ? "bg-orange-50 text-orange-600"
                                      : "text-gray-400 hover:bg-gray-100 hover:text-gray-700",
                                  )}
                                >
                                  <span className="text-[9px]">
                                    {parseInt(month)}月
                                  </span>
                                  <span className="text-sm font-semibold -mt-0.5">
                                    {parseInt(day)}
                                  </span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="right" sideOffset={8}>
                                {s.label}
                              </TooltipContent>
                            </Tooltip>
                          );
                        }

                        // 概览子项：显示圆点
                        return (
                          <Tooltip key={s.id}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => scrollTo(s.id)}
                                className={cn(
                                  "h-5 w-5 flex items-center justify-center rounded-full transition-colors",
                                  subActive
                                    ? "text-gray-900"
                                    : "text-gray-300 hover:text-gray-500",
                                )}
                              >
                                <span
                                  className={cn(
                                    "block rounded-full transition-all",
                                    subActive
                                      ? "h-2.5 w-2.5 bg-gray-900"
                                      : "h-1.5 w-1.5 bg-current",
                                  )}
                                />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={8}>
                              {s.label}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* 底部：展开按钮，与展开态的隐藏按钮位置对应 */}
          <div className="p-4 border-t flex items-center justify-center">
            <Button
              ref={expandButtonRef}
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-600 hover:text-gray-900"
              onClick={() => toggleCollapsed(false)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
