"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Hotel, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PlaceSearchInput from "@/components/PlaceSearchInput";
import type { PlaceSearchResult } from "@/hooks/usePlaceSearch";
import type { PlaceItemInput } from "@/types/place";
import type { DayInfo } from "@/context/places-context";
import { usePlaces } from "@/context/places-context";
import { useBookings } from "@/context/bookings-context";
import { buildGroupKey } from "@/lib/place-groups";
import { canDeletePlace, canDragPlace } from "@/lib/place-kinds";
import { cn } from "@/lib/utils";
import PlaceCard from "../PlaceCard";
import ContainerColorDialog from "../ContainerColorDialog";
import { PlaceDayGap } from "../PlaceGap";
import SortableCardGroup from "@/components/SortableCardGroup";

/**
 * 行程里的"一天"：壳 + 「周四 · 9月24日」标题 + 挂到该天(day_date)的 PlaceCard + 搜索添加。
 *
 * 整天可以收起/展开（跟概览里各列表一样）：收起后只剩标题和副标题。收起的只有
 * **内容**—— 副标题留着，它正是"这一天是什么日子"（"环球影城日"），
 * 一天天翻下来时靠它认路，收起来就看不见等于白写。
 */
export default function DayCard({ day }: { day: DayInfo }) {
  const { dayItemsByDate, addItem, deleteItem, reorderItems, days, setDayTitle } =
    usePlaces();
  // 别跟下面那个本地的 setExpanded 撞名：这个是"展开概览里哪一节"（按 section 取）
  const { hotels, setExpanded: setSectionExpanded } = useBookings();
  const [isAddingPlace, setIsAddingPlace] = useState(false);
  // 纯视图态，不进快照也不落库（跟概览里各列表的展开状态一个性质）。
  // 组件按 dayDate 做 key（DetailContent 里），所以它会跟着这一天走、不会被别的天串用。
  const [expanded, setExpanded] = useState(true);
  // 「···」→「更换颜色」开着的调色弹窗（当前色由弹窗自己从 context 取，这里只存开关）
  const [showColorPicker, setShowColorPicker] = useState(false);

  const toggleExpanded = () => {
    // 收起时把"正在添加"也一并收掉：不然再展开时那个输入框会带着 autoFocus 蹦出来，
    // 页面自己滚一下，用户还以为是误触了什么
    if (expanded) setIsAddingPlace(false);
    setExpanded(!expanded);
  };

  const places = dayItemsByDate(day.dayDate);

  /**
   * 这天晚上有没有地方睡。按"住店的那几晚"算：入住日 <= 今天 < 退房日
   * —— 退房当天人就走了，不算一晚。
   * 行程最后一天不需要住宿，所以那天不提醒。日期都是 "yyyy-MM-dd"，字符串直接比大小。
   */
  const isLastDay =
    days.length > 0 && days[days.length - 1].dayDate === day.dayDate;
  const hasHotelThatNight = hotels.some(
    (h) => h.checkIn <= day.dayDate && day.dayDate < h.checkOut,
  );
  // 只在这天已经有地点时才提这一句：空白天不啰嗦
  const showUnbooked = places.length > 0 && !isLastDay && !hasHotelThatNight;

  /** 滚到概览的 Hotels 那节。收起来的话先展开，否则滚过去只有一行标题 */
  const goToHotels = () => {
    setSectionExpanded("hotels", true);
    document
      .getElementById("list-hotels")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handlePlaceSelect = (result: PlaceSearchResult) => {
    const input: PlaceItemInput = {
      groupKey: buildGroupKey(result),
      name: result.name,
      address: result.address ?? null,
      tel: result.tel ?? null,
      type: result.type ?? null,
      photo: result.photo ?? null,
      lng: result.location?.lng ?? null,
      lat: result.location?.lat ?? null,
    };
    addItem(input, { kind: "day", dayDate: day.dayDate });
    setIsAddingPlace(false);
  };

  return (
    /*
      左边距是 pl-14（56px）而不是 p-6 那 24px：跟概览里 ListShell 的内容区
      （那边也是 pl-14）同一个左沿，于是"概览的小标题 / 这天的小标题 / 两边的
      PlaceCard 左沿"从上往下看是一条竖线。右边仍是 p-6 的 24px。
      这一层里唯一要贴回 24px 的是下面那行标题（那里的 -ml-8）。
    */
    <div className="bg-white rounded-lg p-6 pl-14 shadow-sm">
      {/*
        标题行反着挂回 24px（-ml-8）：卡片左边距已经是留给内容的 56px，而箭头得跟
        概览里各列表的箭头对齐在 24px —— 那边标题行是 px-6，这样两边都从 24 起。
        （负外边距把这一行本身撑宽 32px，右端仍落在 p-6 的 24px 上，那个菜单不动。）
      */}
      <div className="flex -ml-8 items-center justify-between mb-2">
        <div className="flex min-w-0 items-center gap-2">
          {/*
            展开/收起箭头。规格和位置都跟概览里各列表那个一样（h-6 的按钮 + h-5 的
            图标）：内容从 56px 起，箭头占 24..48，标题再从 56px 起（gap-2）。
            图钉（PlaceCard 的 -ml-6）和 PlaceDayGap 那条点线都挂在内容上，一起平移。

            aria-expanded 要留着 —— 这是个展开/收起开关，读屏靠它报状态。但 ghost
            变体里还有一条 `aria-expanded:bg-muted`：展开着的那一整天会顶着一块灰底，
            跟概览里那几个箭头（它们没写这个属性，本来就没底）对不上。
            aria-expanded:bg-transparent 把它抵掉：属性照留，底色不要。
          */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 aria-expanded:bg-transparent"
            onClick={toggleExpanded}
            aria-label={expanded ? "收起这一天" : "展开这一天"}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </Button>

          {/*
            标题是「周四 · 9月24日」，不是「Day 3」：翻到这一天的人先要认出这是现实里的
            哪一天，而"第几天"得自己从行程头数下来。跟侧栏「行程」的小标题同一套写法
            （那边也是这个顺序和这个分隔点），两处指的是同一天，长得也该一样。

            顺序号在这一屏没有了（原来在标题下面那行）。它没丢：地图图层、地点详情卡
            里仍然是「Day N」，而"第几天"本来就等于"从这行往下数第几个"。
          */}
          <h3 className="font-semibold text-2xl truncate">
            {day.weekday} · {day.label}
          </h3>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowColorPicker(true)}>
              更换颜色
            </DropdownMenuItem>
            {/* 下面这两项还没接线（点了没反应），有意留着占位 */}
            <DropdownMenuItem>复制当日</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600 focus:text-red-600">
              删除当日
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/*
        日期下面这行：这一天的副标题，点一下就能写（存在 days.title 里）。
        它放在"收起"的外面 —— 收起后整天只剩标题 + 这行，而"这一天是什么日子"正是
        收起状态下最该看见的东西（见组件头部那段注释）。

        外层 div 只为拿捏它跟下面内容的间距：整天收起时下面没有内容，再留 16px 就变成
        卡片底部凭空多一段空白（所以 DaySubtitle 自己不套包裹元素、也不带外边距）。
      */}
      <div className={cn(expanded && "mb-4")}>
        <DaySubtitle
          value={day.title}
          onSave={(next) => setDayTitle(day.dayDate, next)}
        />
      </div>

      {/* 以下是"收起"时要藏起来的那一整块 */}
      {expanded && (
        <>
          {/* 已排入当天的地点 */}
          {places.length > 0 && (
            <div className="mb-4">
              {/* 拖动排序只在本天内生效（position 按 day 容器重写） */}
              <SortableCardGroup
                ids={places.map((item) => item.id)}
                onReorder={reorderItems}
                onDelete={deleteItem}
                deleteTitle="从这天移除"
                // 地点卡左沿被雨滴图钉压着（PlaceCard 的 -ml-6），柄放卡片里面
                handleSide="right"
                // 酒店行按入住/退房逻辑固定在当天首/尾，不给拖动柄
                canDrag={(id) => {
                  const it = places.find((p) => p.id === id);
                  return it ? canDragPlace(it) : false;
                }}
                // 酒店行是住宿那一行的投影，生命周期归它管 —— 也不给垃圾桶
                canDelete={(id) => {
                  const it = places.find((p) => p.id === id);
                  return it ? canDeletePlace(it) : false;
                }}
                // 卡与卡之间：靠左一条竖向点线把当天行程"串"起来，靠右一行这段路的
                // 交通方式/耗时/距离 + 「路线」（间隔的起点 = 上一张卡，终点 = 下面这张卡）
                renderGap={(beforeId, index, dragging) => {
                  const to = places.find((p) => p.id === beforeId);
                  const from = places[index - 1];
                  if (!from || !to) return null;
                  return <PlaceDayGap from={from} to={to} dragging={dragging} />;
                }}
                renderItem={(id) => {
                  const item = places.find((it) => it.id === id);
                  return item ? <PlaceCard item={item} /> : null;
                }}
              />
            </div>
          )}

          {/* 这天还没订住宿：一行提示，点它滚到概览的 Hotels */}
          {showUnbooked && (
            <Button
              type="button"
              variant="outline"
              onClick={goToHotels}
              className="mb-4 h-auto w-full justify-start gap-2 border-dashed px-3 py-1.5 text-xs font-normal text-gray-400 hover:text-gray-600"
            >
              <Hotel className="h-3.5 w-3.5" />
              这天晚上还没有订住宿
            </Button>
          )}

          {/* 添加地点输入框或按钮 */}
          {isAddingPlace ? (
            <PlaceSearchInput
              placeholder="搜索并添加地点"
              onPlaceSelect={handlePlaceSelect}
              onCancel={() => setIsAddingPlace(false)}
              autoFocus
            />
          ) : (
            <Button
              variant="link"
              className="text-sm text-gray-400 hover:text-gray-600 p-0 h-auto"
              onClick={() => setIsAddingPlace(true)}
            >
              {places.length === 0 ? "还没有添加地点" : "+ 添加地点"}
            </Button>
          )}
        </>
      )}

      {/*
        调色弹窗挂在"收起"的外面：跟副标题同理，「···」在标题行上、收起着也能点，
        挂进 expanded && 里面的话"收起状态点更换颜色"就是点了没反应。
      */}
      <ContainerColorDialog
        open={showColorPicker}
        onOpenChange={setShowColorPicker}
        container={{ kind: "day", dayDate: day.dayDate }}
      />
    </div>
  );
}

/**
 * 日期下面那行：这一天叫什么（"环球影城日"）。
 *
 * 平时就是一行灰字，点一下变输入框，回车/失焦保存、Esc 放弃。没写过时显示灰色的
 * 占位「添加副标题」—— 不藏起来，不然没人知道这里能写。
 *
 * **自己不带外边距、也不套包裹元素**：跟下面内容的距离由 DayCard 那层给 —— 整天收起时
 * 下面没有内容，那个间距该跟着消失（不然卡片底部凭空多一段空白）。
 *
 * ★ 草稿只在**源头那个值真的变了**的时候才重置（照 ListShell 的标题改名）。
 *   setDayTitle 不是乐观更新，是按服务器回来才改 state：提交后那一两秒里 `value`
 *   还是旧值，照着它重置会把用户刚打的字擦掉。所以判据是"值变了没"，不是"渲染了
 *   几次"，并且显示用的是 draft 本身（不是 value）——自己那次保存的回音落下来时
 *   draft 已经等于新值了，重置也不会闪。
 */
function DaySubtitle({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const lastSourceRef = useRef(value);

  useEffect(() => {
    if (value === lastSourceRef.current) return;
    lastSourceRef.current = value;
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    setDraft(next);
    if (next !== (value ?? "")) onSave(next); // 没改就不提交，省一趟往返
  };

  const cancel = () => {
    setEditing(false);
    setDraft(value ?? "");
  };

  return editing ? (
    // 高度跟下面那行灰字一样（h-auto + py-0）：进出编辑态时这一行不会跳
    <Input
      value={draft}
      placeholder="添加副标题"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") cancel();
      }}
      className="h-auto max-w-xs border-0 border-b border-gray-300 rounded-none px-0 py-0 text-sm text-gray-600 shadow-none focus-visible:ring-0"
      autoFocus
    />
  ) : (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="点击编辑副标题"
      className={cn(
        "block h-5 max-w-full truncate text-left text-sm leading-5",
        draft ? "text-gray-500" : "text-gray-400 hover:text-gray-500",
      )}
    >
      {draft || "添加副标题"}
    </button>
  );
}
