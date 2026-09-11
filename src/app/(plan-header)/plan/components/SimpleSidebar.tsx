"use client";

import { useState, type ComponentType } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Hotel,
  MapPin,
  Plane,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
}

/** 平滑滚到详情页里的某个锚点（block:start，锚点自带 scroll-mt 留白） */
const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

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
}: SimpleSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({
    overview: true,
    itinerary: true,
    budget: false,
  });
  const { placeLists, days, listItems, dayItemsByDate } = usePlaces();

  const toggleGroup = (key: string) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

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

  const groups: { key: string; label: string; subs: SubItem[] }[] = [
    { key: "overview", label: "概览", subs: overviewSubs },
    { key: "itinerary", label: "行程", subs: itinerarySubs },
    { key: "budget", label: "预算", subs: [] },
  ];

  if (isCollapsed) {
    return (
      <div className="w-12 border-r flex items-center justify-center bg-gray-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="rotate-180"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <aside className="w-80 border-r flex flex-col h-full bg-white">
      {/* 顶部：AI助手 + 行程名 */}
      <div className="p-4 bg-gradient-to-r from-orange-50 to-orange-100 border-b">
        <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-full flex items-center justify-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="font-medium">AI 助手</span>
        </Button>
        {trip?.name && (
          <p className="mt-2 text-xs text-gray-500 truncate px-1">{trip.name}</p>
        )}
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
                      "text-lg font-bold tracking-wide",
                      bigActive ? "text-white" : "text-gray-900",
                    )}
                  >
                    {g.label}
                  </span>
                </button>
                {g.subs.length > 0 && (
                  <button
                    type="button"
                    aria-label={open[g.key] ? `收起${g.label}` : `展开${g.label}`}
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

              {/* 小标题列表：正在看的黑字高亮，其余灰色 */}
              {open[g.key] && g.subs.length > 0 && (
                <ul className="mt-1 mb-1.5 space-y-0.5 px-2">
                  {g.subs.map((s) => {
                    const subActive = bigActive && activeSubId === s.id;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => scrollTo(s.id)}
                          className={cn(
                            "w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                            subActive
                              ? "bg-gray-100 text-gray-900 font-semibold"
                              : "text-gray-400 hover:bg-gray-50 hover:text-gray-700",
                          )}
                        >
                          <s.icon
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              subActive ? "text-gray-700" : "text-gray-300",
                            )}
                          />
                          <span className="truncate flex-1">{s.label}</span>
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
              )}
            </div>
          );
        })}
      </nav>

      {/* 底部：隐藏侧边栏 */}
      <div className="p-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(true)}
          className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>隐藏侧边栏</span>
        </Button>
      </div>
    </aside>
  );
}
