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
  const {
    dayItemsByDate,
    addItem,
    deleteItem,
    reorderItems,
    days,
    setDayTitle,
  } = usePlaces();
  // 别跟下面那个本地的 setExpanded 撞名：这个是"展开概览里哪一节"（按 section 取）
  const { hotels, setExpanded: setSectionExpanded } = useBookings();
  const [isAddingPlace, setIsAddingPlace] = useState(false);

  const places = dayItemsByDate(day.dayDate);

  /*
   * 纯视图态，不进快照也不落库（跟概览里各列表的展开状态一个性质）。
   * 组件按 dayDate 做 key（DetailContent 里），所以它会跟着这一天走、不会被别的天串用。
   *
   * 默认值看这天**有没有地点**：空白天默认合拢 —— 不然一趟行程从头翻到尾，全是
   * 「标题 + 副标题 + 这天晚上还没有订住宿 + 还没有添加地点」，真有内容的那几天被淹在
   * 里面。有地点的照旧默认展开。
   *
   * ★ 只在**挂载那一次**算（useState 的初值本来就只取第一次）：往一个空白天里加进第一个
   *   地点时 places 从 0 变 1，不会把用户手动合上的那天又弹开。places 因此必须挪到这一行
   *   上面（TDZ）。
   */
  const [expanded, setExpanded] = useState(() => places.length > 0);
  // 「···」→「更换颜色」开着的调色弹窗（当前色由弹窗自己从 context 取，这里只存开关）
  const [showColorPicker, setShowColorPicker] = useState(false);

  const toggleExpanded = () => {
    // 收起时把"正在添加"也一并收掉：不然再展开时那个输入框会带着 autoFocus 蹦出来，
    // 页面自己滚一下，用户还以为是误触了什么
    if (expanded) setIsAddingPlace(false);
    setExpanded(!expanded);
  };

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
      左边距 lg 以上是 pl-14（56px）而不是 p-6 那 24px：跟概览里 ListShell 的内容区
      （那边也是 pl-14）同一个左沿，于是"概览的小标题 / 这天的小标题 / 两边的
      PlaceCard 左沿"从上往下看是一条竖线。右边仍是 p-6 的 24px。
      这一层里唯一要贴回 24px 的是下面那行标题（那里的 -ml-8）。

      ★ 手机上是 px-3：**左右一样**的 12px。内容左沿跟下面那行标题的展开箭头对齐
      （箭头就落在卡片左沿往里 12px 上），也跟概览里 ListShell 的内容区同一个数 ——
      这一套一共出现在三处（这里、ListShell 标题行、ListShell 内容区），再加上
      ListDivider 的 left-1，改一处就得全改，否则那条竖线断掉。
      上下不动（py-6）：这次收的是左右的白，纵向的呼吸留着。

      注意手机上"内容左沿 12px"和"大标题那个字"并不是一条线：标题字在 44px（箭头
      24 + gap-2 的 8 之后）。副标题 / 添加地点 / 搜索框这三处要跟着标题走，各自挂了
      ml-8 lg:ml-0 —— 理由和算法见下面副标题那段 ★。
    */
    <div className="bg-white rounded-lg py-6 px-3 shadow-sm lg:pl-14 lg:pr-6">
      {/*
        标题行在 lg 以上要反着挂回来：卡片左边距是留给内容的 56px，而箭头得跟概览里
        各列表的箭头对齐（那边标题行是 lg:px-6）—— -8 = 56 → 24，两边都从同一个数起。
        （负外边距把这一行本身撑宽 32px，右端仍落在 pr-6 的 24px 上，那个菜单不动。）

        手机上不用挂：卡片本身就是 px-3，这一行天然从 12px 起，跟概览里各列表标题行的
        px-3 同一个数 —— 箭头仍旧对齐（见组件头部那段）。
      */}
      <div className="flex items-center justify-between mb-2 lg:-ml-8">
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

        ★ ml-8 lg:ml-0：手机上这一行要跟大标题「周四 · 9月24日」的**字**左对齐，而那个
        字不在内容左沿上 —— 它前面还站着一个 24px 的箭头和 gap-2 的 8px，字从
        12 + 24 + 8 = 44px 起，所以这里跟 32px（ml-8）。
        lg 以上不用跟：那时卡片是 pl-14，标题行自己 -ml-8 反挂回 24px，箭头占 24..48，
        标题字正好落在 56px —— 就是内容左沿，于是 ml 归零（lg:ml-0）。

        ★ 它和下面「+ 添加地点」那个按钮、以及点开后的搜索框是**同一个左沿**，三处
        一起动。再往下的地点卡不跟（它们本来就贴内容左沿，没有这个偏移）。
      */}
      <div className={cn("ml-8 lg:ml-0", expanded && "mb-4")}>
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
                  return (
                    <PlaceDayGap from={from} to={to} dragging={dragging} />
                  );
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
              // 跟「+ 添加地点」同一个左沿（见上面副标题那段 ★），点开时这一行不跳
              className="ml-8 lg:ml-0"
              placeholder="搜索并添加地点"
              onPlaceSelect={handlePlaceSelect}
              onCancel={() => setIsAddingPlace(false)}
              autoFocus
            />
          ) : places.length === 0 ? (
            /*
              空白天：这一句包一层跟 PlaceCard **同款**的灰框（rounded-lg bg-gray-100
              加同一套内边距），于是它读起来是"这一天里的一张空卡"，而不是一行飘着的
              灰字 —— 后者在这一屏（标题 + 副标题 + 订住宿提示）里太容易被当成说明文字
              一眼划过去。
              ★ 点击动作一个字没改（还是开那个搜索框），换的只是外观。

              外面套 div 是为了 ml-8：直接在按钮上写 ml-8 + w-full 会多出 32px 溢出
              （w-full 是父级的 100%，外边距不算在里面）。这个左沿跟上面那个搜索框、
              里面的 PlaceCard 是同一条（lg 以上那一列整体已经是缩进的，所以 lg:ml-0）。
            */
            <div className="ml-8 lg:ml-0">
              <button
                type="button"
                onClick={() => setIsAddingPlace(true)}
                className="w-full rounded-lg bg-gray-100 px-2 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-500 lg:px-3"
              >
                还没有添加地点
              </button>
            </div>
          ) : (
            <Button
              variant="link"
              className="ml-8 lg:ml-0 text-sm text-gray-400 hover:text-gray-600 p-0 h-auto"
              onClick={() => setIsAddingPlace(true)}
            >
              + 添加地点
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
