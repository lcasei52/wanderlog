"use client";

import { useEffect, useState } from "react";
import {
  Bus,
  Car,
  ChevronDown,
  EyeOff,
  PersonStanding,
  Plus,
  Route,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PlaceSearchInput from "@/components/PlaceSearchInput";
import type { PlaceSearchResult } from "@/hooks/usePlaceSearch";
import { useInView } from "@/hooks/useInView";
import { useRoutes } from "@/context/routes-context";
import { usePlaces } from "@/context/places-context";
import type { PlaceItem } from "@/types/place";
import {
  ROUTE_MODES,
  ROUTE_MODE_LABEL,
  amapNavigationUrl,
  formatDistance,
  formatDuration,
  gapKey,
  routeKey,
  routeModeOf,
  type RouteMode,
} from "@/lib/place-route";
import { cn } from "@/lib/utils";

/** 三种交通方式对应卡片上那行的图标（与用户描述的"人 / 公交车 / 汽车"一致） */
const MODE_ICON: Record<RouteMode, LucideIcon> = {
  walking: PersonStanding,
  transit: Bus,
  driving: Car,
};

/* ====================================================================
 * 地点卡之间的"间隔"（由 SortableCardGroup 的 renderGap 渲染在两张卡中间）
 * ==================================================================== */

interface PlaceListGapProps {
  /** 在这个间隔里选中地点 → 由父组件插到该位置（父组件负责落库 + 本地插入） */
  onPlaceSelect: (place: PlaceSearchResult) => void;
  /** 正在拖别的卡 → 收起这行的交互，让位给橙色插入线 */
  dragging?: boolean;
}

/**
 * 地点列表里两张卡之间的间隔。
 * 平时什么都不显示（就是一条 24px 的空隙）；鼠标移到间隔上才浮出
 * 「贯通整行的灰色虚线 + 左端一个 +」，点 + 出下拉「添加地点」，
 * 选了就地在这个间隔里展开搜索框（与列表尾部那个添加框行为一致）。
 * 没选结果就点到别处 / 按 X / Esc → 收起，什么也不加。
 */
export function PlaceListGap({ onPlaceSelect, dragging }: PlaceListGapProps) {
  const [openInput, setOpenInput] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // 展开输入框后就不再是"空隙"，直接把间隔撑高
  if (openInput) {
    return (
      <div className="py-1">
        <PlaceSearchInput
          placeholder="添加地点"
          onPlaceSelect={(place) => {
            setOpenInput(false);
            onPlaceSelect(place);
          }}
          onCancel={() => setOpenInput(false)}
        />
      </div>
    );
  }

  // 拖动时收起交互，但高度要占住（不然卡片会在拖动过程中往上跳）
  if (dragging) return <div className="h-6" />;

  // 下拉菜单开着时指针已经离开这条间隔，但虚线 + 号要保持可见，不然像凭空消失
  const stayVisible = menuOpen ? "opacity-100 pointer-events-auto" : null;

  /*
   * 触摸设备上这个 + 常显（压低透明度），因为那边 hover 根本不存在：
   * Tailwind v4 把 hover: / group-hover: 全包在 @media (hover: hover) 里
   * （可以在编译产物里核对），触摸设备上 group-hover/gap:opacity-100 那两条
   * 压根不匹配 —— 不是"透明但还在"，是圆钮永远出不来。间隔里的就地插入在触摸上
   * 没有别的入口（列表尾部那个添加框只能加到最后），所以这里必须常显。
   *
   * menuOpen 时必须为 null：stayVisible 里的 opacity-100 是**基础类**，
   * 而 pointer-coarse:opacity-40 是变体，变体规则在样式表里排在基础工具之后、
   * 同权重必胜 —— 留着它，菜单开着圆钮也只有 40%，看着像坏了。
   */
  const coarseEntry = menuOpen
    ? null
    : "pointer-coarse:opacity-40 pointer-coarse:pointer-events-auto";

  return (
    // h-6：这条间隔本身的高度（在流里，所以会把 SortableCardGroup 的间隔撑到 24px），
    // hover 区正好等于它，不越界到上下两张卡里
    <div className="group/gap relative h-6">
      {/* 贯通整行的灰色虚线（hover 才浮出） */}
      <span
        className={cn(
          "pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-gray-300 opacity-0 transition-opacity group-hover/gap:opacity-100",
          stayVisible,
        )}
      />

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            aria-label="在此处添加地点"
            title="在此处添加地点"
            // size-4：16px 的小圆钮，正好骑在间隔上（图标用 size-3，避开 Button 的 svg 默认尺寸规则）
            // pointer-coarse:size-6：触摸上放大到 24px —— 16px 手指点不准，而这条间隔
            // 本身正好 h-6（24px），撑满它不越界到上下两张卡里去。
            className={cn(
              "size-4 rounded-full absolute left-0 top-1/2 -translate-y-1/2 p-0 text-gray-500 opacity-0 pointer-events-none transition-opacity group-hover/gap:opacity-100 group-hover/gap:pointer-events-auto hover:border-orange-400 hover:text-orange-500 focus-visible:opacity-100 focus-visible:pointer-events-auto pointer-coarse:size-6",
              stayVisible,
              coarseEntry,
            )}
          >
            <Plus className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuItem onSelect={() => setOpenInput(true)}>
            添加地点
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface PlaceDayGapProps {
  /** 上一张卡（路线的起点） */
  from: PlaceItem;
  /** 下一张卡（路线的终点） */
  to: PlaceItem;
  /** 正在拖别的卡 → 收起这行的交互，让位给橙色插入线 */
  dragging?: boolean;
}

/**
 * 行程（Day）里两张卡之间的间隔，两件事：
 *
 * 1. 卡片左沿往里一点一条竖向点线，把同一天的卡片"串"起来 —— 线在 x = 24..26
 *    （left-6 的 24px + w-0.5 的 2px），也就是卡片左沿往里 25px。
 *    图钉是**压着卡片左沿**钉的（见 PlaceCard 的 -ml-6，lg 以上）：头是个 24px 的圆、
 *    中心落在卡片左沿 x = 0 上，右边缘到 x = 12 —— 所以这条线其实是走在卡片里面的一根
 *    "轨道"，跟钉头之间还隔着 12px。
 *    手机上（那边 -ml-6 不生效）图钉收进了卡里，头占 8..32、中心在 20，线（25）
 *    比钉头中心偏右 5px —— 就在钉头右缘里侧一点，看着仍是从图钉这一列穿下去的。
 *    要挪它改 left-6，想核对跟图钉的关系就一起看 PlaceCard 的 -ml-6（一对数，
 *    动一个就瞄一眼另一个）。
 * 2. 点线右边一行"这段路怎么走"：交通方式图标 + 耗时 · 距离 + 下拉箭头，
 *    末尾是「路线」（跳高德导航页，并把我们地图上的那条线画出来）。
 *    点这行其余地方出下拉：三种方式的时间/距离、「隐藏路线」、「更改默认设置」。
 *    这一行和酒店小字都从 left-8 起，在点线右侧排成同一条竖列。
 *
 * 查询是懒加载的：滚进视野才查当前模式，下拉展开再补另外两种（见 routes-context）。
 * 起点/终点任一端没有坐标 → 只留那条点线。
 */
export function PlaceDayGap({ from, to, dragging }: PlaceDayGapProps) {
  const { defaultMode, plans, ensurePlan, hiddenGaps, hideGap, showGap } =
    useRoutes();
  const { updateItem } = usePlaces();
  const [menuOpen, setMenuOpen] = useState(false);
  // 滚到眼前才去查（提前 240px 触发，滚到时结果已经在了）
  const { ref, inView } = useInView<HTMLDivElement>();

  const gap = gapKey(from.id, to.id);
  const hidden = hiddenGaps.has(gap);
  // 交通方式存在**起点卡**上（place_items.route_mode_to_next），不是本地 state：
  // 地图那边要按同样的模式取路径，而且拖排序/换天之后这段路得跟着起点走。
  const mode = routeModeOf(from, defaultMode);
  const { lng: fromLng, lat: fromLat } = from;
  const { lng: toLng, lat: toLat } = to;
  const hasCoords =
    fromLng != null && fromLat != null && toLng != null && toLat != null;

  const pointsOf = () => {
    if (!hasCoords) return null;
    return {
      from: { lng: fromLng, lat: fromLat, name: from.name },
      to: { lng: toLng, lat: toLat, name: to.name },
    };
  };

  const points = pointsOf();
  const planKey = points ? routeKey(points.from, points.to, mode) : null;
  const state = planKey ? plans[planKey] : undefined;

  // 懒加载：滚进视野且没被隐藏时，查当前模式这一条
  useEffect(() => {
    if (dragging || hidden || !inView) return;
    if (!points) return;
    ensurePlan(
      routeKey(points.from, points.to, mode),
      points.from,
      points.to,
      mode,
    );
    // points 每次渲染都是新对象，这里按它的原始值做依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dragging,
    hidden,
    inView,
    mode,
    fromLng,
    fromLat,
    toLng,
    toLat,
    ensurePlan,
  ]);

  // 下拉一展开就把另外两种也查了，好让菜单里三行都是现成的
  useEffect(() => {
    if (!menuOpen || !points) return;
    for (const m of ROUTE_MODES) {
      ensurePlan(
        routeKey(points.from, points.to, m),
        points.from,
        points.to,
        m,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen, fromLng, fromLat, toLng, toLat, ensurePlan]);

  /** 点「路线」：跳高德导航页（要不要在我们地图上画线由图层那个总开关决定） */
  const handleNavigate = () => {
    if (!points) return;
    window.open(
      amapNavigationUrl(points.from, points.to, mode),
      "_blank",
      "noopener,noreferrer",
    );
  };

  /**
   * 换模式：落库到起点卡的 route_mode_to_next，更新成功后 updateItem 会换掉本地那份
   * 实例 —— 这一行跟着改口径；地图上画着这条的话，线也跟着换成新模式。
   */
  const handleModeChange = (next: RouteMode) => {
    void updateItem(from.id, { routeModeToNext: next });
  };

  /**
   * 隐藏这一行。地图上的线是"从卡片推导 + 排除被隐藏的间隔"算出来的，
   * 所以这里只要把间隔记成隐藏，线自然就没了（不用去通知地图）。
   */
  const handleHide = () => hideGap(gap);

  const ModeIcon = MODE_ICON[mode];

  return (
    // h-7：把间隔撑到 28px，点线才有"一段一段"的连接感（比 PlaceListGap 那个
    // 24px 的间隔略宽一点：那边是列表，这里是日程，多给 4px 呼吸）
    <div ref={ref} className="group/gap relative h-7">
      <span
        aria-hidden
        className="absolute left-6 inset-y-0 w-0.5"
        // 用重复渐变画点线：8px 一段（4px 实 + 4px 空），比 border-dashed 在这么短的高度上更匀
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, #d1d5db 0 4px, transparent 4px 8px)",
        }}
      />

      {/* 被「隐藏路线」收起来后，hover 这条间隔给个恢复入口，否则点一次就再也找不回来 */}
      {!dragging && hidden && (
        <Button
          variant="ghost"
          size="sm"
          title="显示路线"
          /*
            触摸上常显（同 PlaceListGap 那个 + 的理由），但透明度只压到 60% 而不是 40%：
            这行是 11px 的 text-gray-400（#99a1af），再乘 40% 差不多 #d6d9dd，
            跟旁边那条 bg-gray-100 的分隔线已经是同一个量级，手机上会糊成一道灰痕。
            h-7 则正好填满这条间隔（它自己就是 h-7），触摸目标 20px → 28px，居中不变。
          */
          className="absolute left-8 top-1/2 h-5 -translate-y-1/2 px-1.5 text-[11px] font-normal text-gray-400 opacity-0 transition-opacity group-hover/gap:opacity-100 hover:text-gray-600 focus-visible:opacity-100 pointer-coarse:opacity-60 pointer-coarse:h-7"
          onClick={() => showGap(gap)}
        >
          <Route className="h-3 w-3" />
          显示路线
        </Button>
      )}

      {/* 点线右边那行：模式图标 + 耗时 · 距离 + 下拉箭头，然后是「路线」 */}
      {!dragging && !hidden && hasCoords && (
        <div className="absolute inset-y-0 left-8 flex items-center gap-0.5">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="这段路的交通方式"
                // pointer-coarse:h-7：这行本来就是 h-7，撑满它 → 触摸目标 20px → 28px
                className="h-5 px-1.5 text-xs font-normal text-gray-500 hover:bg-gray-100 hover:text-gray-700 pointer-coarse:h-7"
              >
                <ModeIcon className="h-3.5 w-3.5" />
                <span className="tabular-nums">
                  {state?.status === "ready" ? (
                    <>
                      {formatDuration(state.plan.time)}
                      <span className="mx-0.5 text-gray-300">·</span>
                      {formatDistance(state.plan.distance)}
                    </>
                  ) : (
                    <span className="text-gray-400">
                      {state?.status === "empty"
                        ? "无路线"
                        : state?.status === "error"
                          ? "查询失败"
                          : "计算中…"}
                    </span>
                  )}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {ROUTE_MODES.map((m) => {
                const Icon = MODE_ICON[m];
                const s = points
                  ? plans[routeKey(points.from, points.to, m)]
                  : undefined;
                return (
                  <DropdownMenuItem
                    key={m}
                    onSelect={() => handleModeChange(m)}
                    className={cn(m === mode && "font-medium text-gray-900")}
                  >
                    <Icon
                      className={cn(
                        "text-gray-400",
                        m === mode && "text-gray-900",
                      )}
                    />
                    <span>{ROUTE_MODE_LABEL[m]}</span>
                    <span className="ml-auto text-xs font-normal text-gray-500 tabular-nums">
                      {s?.status === "ready"
                        ? `${formatDuration(s.plan.time)} · ${formatDistance(s.plan.distance)}`
                        : s?.status === "empty"
                          ? "无方案"
                          : s?.status === "error"
                            ? "查询失败"
                            : "…"}
                    </span>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleHide}>
                <EyeOff className="text-gray-400" />
                隐藏路线
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  toast.info("更改默认设置", {
                    description: "默认交通方式设置后续完善",
                  })
                }
              >
                <Settings2 className="text-gray-400" />
                更改默认设置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            title="用高德地图导航这段路"
            className="h-5 px-1.5 text-xs font-medium text-gray-500 hover:bg-orange-50 hover:text-orange-600 pointer-coarse:h-7"
            onClick={handleNavigate}
          >
            路线
          </Button>
        </div>
      )}
    </div>
  );
}
