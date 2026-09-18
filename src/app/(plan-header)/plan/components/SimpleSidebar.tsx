"use client";

import { useRef, useState, type ComponentType } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  Hotel,
  Map,
  MapPin,
  Plane,
  Sparkles,
  StickyNote,
  Train,
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
import { useBookings } from "@/context/bookings-context";

interface SubItem {
  id: string; // 锚点 id，点击/高亮都用它
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface SimpleSidebarProps {
  trip?: TripSummary;
  /** 当前阅读位置所在的大类 id（overview / itinerary / budget） */
  activeSection?: string | null;
  /** 当前阅读位置所在的小标题锚点 id（list-* / day-*）；无则 null */
  activeSubId?: string | null;
  /** 点击 AI 助手按钮的回调 */
  onAiClick?: () => void;
  /**
   * rail   = 桌面那条长在流里的竖栏（w-48 ⇄ w-12 "拉窗帘"，下面全部既有逻辑都是它的）
   * drawer = 手机抽屉里那一份（见 MobileSidebar）：同样一份目录，但没有窄轨态，
   *          宽度交给抽屉外壳定，所以这里只管填满
   */
  variant?: "rail" | "drawer";
  /**
   * drawer 模式下点底部「隐藏侧边栏」要干什么（那是**关抽屉**，不是收成窄轨）。
   * rail 模式不用传，走原来的 toggleCollapsed(true)。
   */
  onHide?: () => void;
}

/** 平滑滚到详情页里的某个锚点（block:start，锚点自带 scroll-mt 留白） */
const scrollTo = (id: string) =>
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });

/**
 * 侧边栏 = 详情页的目录（scrollspy TOC）：
 * 三个大组（概览/行程/预算），正在看的大类标题 → 黑底白字块；
 * 大类下的小标题（概览=list 块、行程=每天、预算=一条「查看」），正在看的那个 → 黑字高亮，
 * 其余灰色。点大标题滚到大节、点小标题滚到对应列表/某天。
 */
export default function SimpleSidebar({
  trip,
  activeSection,
  activeSubId,
  onAiClick,
  variant = "rail",
  onHide,
}: SimpleSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  /*
   * 抽屉模式下永远按"展开"渲染 —— 手机没有窄轨那一态（收起 = 抽屉关上，由
   * MobileSidebar 的 inert / -translate-x-full 负责，跟这里的 isCollapsed 无关）。
   * 下面的类名、inert、条件渲染全部读这个派生值，于是 rail / drawer 只差一个开关。
   */
  const collapsed = variant === "rail" && isCollapsed;
  /*
   * 预算默认也要展开：它那唯一一个子项「查看」是**入口**不是装饰，默认收起就等于
   * 用户根本看不见这个入口（还得先猜到要点那个箭头）。其余两组本来就是展开的。
   */
  const [open, setOpen] = useState<Record<string, boolean>>({
    overview: true,
    itinerary: true,
    budget: true,
  });
  const { placeLists, days } = usePlaces();
  // 火车那一节目录项要按有没有火车决定显不显示（见下面 overviewSubs）
  const { trains } = useBookings();

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

  // 概览下的固定四块 + 各地点列表（标题跟随改名，锚点用 list.id）
  const overviewSubs: SubItem[] = [
    { id: "list-notes", label: "Notes", icon: StickyNote },
    { id: "list-flights", label: "Flights", icon: Plane },
    /*
     * 火车是**条件项**：一趟都没有时正文里那节整个不存在（TrainsList 空列表不渲染
     * ListShell），这里列出来的话就是个点了没反应的死链。航班/住宿不用管，它们那节
     * 一直在（空态是个空壳，不是"不存在"）。
     * 位置跟正文一致（火车在住宿之前）—— 这一列是目录，顺序得跟正文对得上。
     */
    ...(trains.length > 0
      ? [{ id: "list-trains", label: "Trains", icon: Train }]
      : []),
    { id: "list-hotels", label: "Hotels", icon: Hotel },
    ...placeLists.map((l) => ({
      id: `list-${l.id}`,
      label: l.title,
      icon: MapPin,
    })),
  ];
  /*
   * 行程下的每天。标签用**周几 + 月日**，不是「Day N」：
   * 翻目录的人是在找"哪天"，"周四 · 9月18日"能直接对上现实里的日子，而"第 3 天"还得
   * 心里数一遍。正文 DayCard 的标题现在是同一套写法（它底下那行小字才是顺序号）。
   *
   * 两个串都由 DayInfo 带过来、不在这儿 format：格式留在 buildDays 一处，
   * 免得侧栏和正文各写一份 EEE / EEEE 慢慢分叉。
   */
  const itinerarySubs: SubItem[] = days.map((d) => ({
    id: `day-${d.dayDate}`,
    label: `${d.weekday} · ${d.label}`,
    icon: CalendarDays,
  }));

  const groups: {
    key: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    subs: SubItem[];
  }[] = [
    { key: "overview", label: "概览", icon: Compass, subs: overviewSubs },
    { key: "itinerary", label: "行程", icon: Map, subs: itinerarySubs },
    /*
     * 预算只有一个子项「查看」，滚的就是它自己的锚点 —— 大标题本来也能点，但"标题能点"
     * 这件事没人看得出来，摆一行小字才像入口。id 直接用 g.key（"budget"），于是它和
     * 大标题滚的是同一个位置（高亮也跟着大类走，见下面 subActive 那一处）。
     */
    {
      key: "budget",
      label: "预算",
      icon: Wallet,
      subs: [{ id: "budget", label: "查看", icon: Eye }],
    },
  ];

  /*
   * 展开态和折叠态是**同一个 <aside> 里的两层**，不再各写一个 return。
   *
   * 以前是 `if (isCollapsed) return (...)` / `return (...)` 两个分支，也就是两份
   * 完全独立的 DOM 树 —— 切换时 React 把一份整棵删掉、另一棵整棵新建，中间没有任何
   * "同一个元素"可以让浏览器插值，所以宽度只能瞬变，加多少 transition 都不会动。
   *
   * 现在的做法：<aside> 负责宽度过渡（w-48 ⇄ w-12），原本两份内容都留在里面，
   * 各自绝对定位、叠在一起，靠 opacity 交叉淡入淡出。外层 overflow-hidden 配上
   * **内层固定宽度**（w-48 / w-12 写死，绝不能改成 w-full），展开时就是像拉窗帘一样
   * 把内容逐步"露"出来 —— 是滑，不是压扁（内容不跟着父级每帧重排）。
   *
   * 展开态那个 192px 是量出来的、不是凭手感定的：最宽的一行是行程子项
   * 「周四 · 9月18日」（约 107px），加上 ul 的 px-2、按钮的 px-3（左右各 20px），
   * 再留一点余量就到了 192。子项不再带图标之后宽度就由"最长的那行文字"说了算，
   * 而各地点列表的名字是用户自己起的 —— 真起得比这更长时由 truncate 收尾。
   *
   * 宽度那对类名写在 <aside> **外面那层壳**上、<aside> 改成 w-full：壳是 flex item，
   * 侧栏的伸缩还是它说了算，只是多给了一个"能被溢出内容依赖"的定位父级（AI 助手
   * 按钮得挂在这儿，理由见它自己的注释）。
   */
  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          variant === "rail"
            ? // 桌面：长在流里的一条竖栏，w-48 ⇄ w-12 靠宽度过渡"拉窗帘"。
              // max-lg:hidden：小屏走 MobileSidebar 那套抽屉，这条整个不出现
              // （包括那个 w-12 窄轨 —— 手机上它换成上侧两枚圆钮）
              "relative h-full shrink-0 max-lg:hidden transition-[width] duration-200 ease-out motion-reduce:transition-none"
            : // 抽屉里：宽度由抽屉外壳（MobileSidebar）说了算，这里只管填满它
              "relative h-full w-full",
          variant === "rail" && (isCollapsed ? "w-12" : "w-48"),
        )}
      >
        <aside className="relative h-full w-full overflow-hidden border-r bg-white">
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
            inert={collapsed}
            className={cn(
              "absolute inset-y-0 left-0 flex flex-col transition-opacity duration-200 motion-reduce:transition-none",
              /*
               * rail 里宽度必须写死 192px：上面"拉窗帘"那段靠的就是"内层固定宽、
               * 外层裁"，跟着父级走的话内容会每帧重排，就不是滑而是压扁了。
               * drawer 里反过来必须跟着抽屉走 —— 抽屉在 375px 屏上只有 168px，
               * 这里还留 w-48 的话右边 24px 会被 <aside> 的 overflow-hidden 切掉
               * （表现是"周四 · 9月18日"贴着被切断）。
               */
              variant === "rail" ? "w-48" : "w-full",
              collapsed ? "pointer-events-none opacity-0" : "opacity-100",
            )}
          >
            {/*
              顶部空档 = 壳上那个 AI 助手按钮占的高度（h-14 + top-4 = 72px = h-18）。
              按钮挂不到这一层里（见它自己的注释），所以只能用留白把它"让"出来，
              否则导航第一项「概览」正好压在它底下。
              这里**没有**分隔线：按钮和大标题之间不留横杠（它是浮在侧栏上的一个球，
              不是一节内容，画条线反而像把它框进了目录里）。
            */}
            {/*
              drawer 里那颗胶囊是 hidden 的（手机上换成 DetailContent 左上角两枚圆钮），
              再留 72px 就是抽屉顶上白白空一截，收成普通内边距。
            */}
            <div
              className={cn("shrink-0", variant === "rail" ? "h-18" : "h-4")}
            />

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

                      注意 g.subs.length > 0 要单独留着：这一行是给"将来某个大类没有子项"
                      兜底的（今天三组都有，丢了它也只是渲染一个空 ul）。
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
                            /*
                             * 子项 id 等于自己大类的 key（只有预算那个「查看」是这样），
                             * 说明它就是这个大类的锚点本身、没有更细的位置可分 ——
                             * 那就跟着大类一起点亮，否则读到预算时那行永远是灰的，
                             * 看着像"还没滚到"。
                             */
                            const subActive =
                              bigActive &&
                              (activeSubId === s.id || s.id === g.key);
                            return (
                              <li key={s.id}>
                                {/*
                                  展开态**不带图标**，图标只在折叠层出现（见下面那一段）。
                                  图标和文字是同一件东西的两遍说法，并排放着只是白占一列
                                  宽度；去掉这一列也正是整个侧栏能收到 w-48 的前提 ——
                                  省下的「图标 + gap」那 22px 让标签一个都不用截断。

                                  两层各自的分工：展开态有文字，文字说得比图标清楚；折叠态
                                  文字没了，图标是唯一还认得出"这是哪一项"的东西。

                                  px-3 保留不动：外面 ul 是 px-2、大标题行是 mx-2 + pl-3，
                                  两边左边距都是 20px，子项的文字才跟大标题对得齐。
                                */}
                                <button
                                  type="button"
                                  onClick={() => scrollTo(s.id)}
                                  className={cn(
                                    /*
                                      text-left **不能省**（大标题那一行也有它）：
                                      原生 <button> 的 UA 样式自带 text-align:center，
                                      而这里的标签是 flex-1 的 span（撑满整行），
                                      居中就在这一行里显出来了 —— 标签会飘到中间。
                                      大标题那行的 span 是自适应宽度，居中看不出来，
                                      所以那边写了也像没用，但它是同一个原因下的同一个解。
                                    */
                                    "w-full flex items-center rounded-md px-3 py-1.5 text-base text-left transition-colors",
                                    subActive
                                      ? "bg-gray-100 text-gray-900 font-semibold"
                                      : "text-gray-400 hover:bg-gray-50 hover:text-gray-700",
                                  )}
                                >
                                  <span className="truncate flex-1">
                                    {s.label}
                                  </span>
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
                /*
                 * rail：收成 w-12 窄轨（toggleCollapsed 里那套焦点搬家逻辑只在这条路上有意义）
                 * drawer：关掉抽屉。手机没有窄轨态，收起 = 这一整块消失，焦点交给抽屉外壳的 inert
                 */
                onClick={onHide ?? (() => toggleCollapsed(true))}
                className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>隐藏侧边栏</span>
              </Button>
            </div>
          </div>

          {/*
            折叠层：图标轨。同上，固定 w-12。
            variant === "drawer" 时整个 hidden（display:none）—— 手机收起来 = 抽屉关上，
            不留窄轨，改由正文上侧那两枚圆钮（✨ / ☰）承担"随时够得着"这件事。
            用 display:none 而不是条件渲染：这一层在抽屉里根本不会出现，没有可过渡的中间态，
            省得把下面两百行 JSX 整段挪进一个 {variant === "rail" && (...)} 里再重排缩进。
            display:none 本身就会把它摘出 Tab 序，所以和 inert 不冲突。
          */}
          <div
            ref={collapsedLayerRef}
            inert={!isCollapsed}
            className={cn(
              "absolute inset-y-0 left-0 w-12 flex flex-col transition-opacity duration-200 motion-reduce:transition-none",
              isCollapsed ? "opacity-100" : "pointer-events-none opacity-0",
              variant === "drawer" && "hidden",
            )}
          >
            {/* AI 助手：高度跟展开态那个按钮对齐（h-18），两种状态切换时目录不会跳 */}
            <div className="h-18 shrink-0 flex items-center justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onAiClick}
                    size="icon"
                    className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white shadow-md hover:shadow-lg transition-all"
                  >
                    {/*
                      size-5 不是 h-5 w-5：Button 基类里那条
                      `[&_svg:not([class*='size-'])]:size-4` 会把"类名里没有 size- 的图标"
                      一律压成 16px，写 h-5 w-5 是白写（这也是它原来只有 16px 的原因）。
                    */}
                    <Sparkles className="size-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  AI 助手
                </TooltipContent>
              </Tooltip>
            </div>

            {/*
              折叠态目录。

              这一串内外边距不是各自拍脑袋定的，它们是一组，唯一的目的是让展开/收起时
              **每一项只左右移动、上下不跳**。所以要把两层的垂直节奏算成同一个：

                两层都从这个点起算：层顶 + h-18 空档(72) + 导航 py-2(8)。

              展开层一组 = 组 py-0.5(上下各 2) + 大标题行 44 + ul mt-1(4) + 子项 + ul mb-1.5(6)
                · 大标题行 44 = text-xl 行高 28 + py-2×2
                · 一条子项 36 = text-base 行高 24 + py-1.5×2，项间 space-y-0.5 = 2
                · 组高 = 38n + 56
                · 标题中心距组顶 2+22 = 24；第一条子项中心距组顶 2+44+4+18 = 68

              这边下面那几个类名就是照着上面反推的（n 是这一组的子项数）：
                · 图标按钮 mt-1.5(6) + h-9(36) → 中心距块顶 24 ✓ 对大标题中心
                · 子项容器 mt-2(8) → 第一条子项从 6+36+8 = 50 起 ✓ 对 ul 的内容起点 2+44+4
                · 容器 mb-1(4) + 导航 gap-1(4) → 组高 = 50 + (38n-2) + 4 + 4 = 38n+56 ✓

              **py-0.5 是 2px 不是 4px**（这个标尺里 0.5 = 0.125rem）—— 这一串数里最容易看错
              的就是它：把它当 4px 算，两层的组高就差 4px，而那是**每组**差 4px，于是整列
              一组一组往下漂（2px → 6px → 10px），看着像"越高越歪"。这里已经用真实渲染量过。

              改任何一边的行高、行距、标题字号，另一边都要跟着重算（text-xl/text-base 的
              行高、py-2/py-1.5、h-9 是绑在一起的）。另外 `g.subs.length > 0` 那个兜底分支
              真用上时（某组没有子项），两层的组高会差 16px，届时也要一起调。
            */}
            {/*
              [scrollbar-width:none] + [&::-webkit-scrollbar]:hidden：轨道里必须把滚动条藏掉。
              这一列的内容（3 组 + 每天的日期）在常见行程下都比轨道高，会出滚动条，而滚动条
              要吃 15px 宽 —— items-center 于是在剩下的 33px 里居中，36px 的按钮偏到 x=-1.5，
              看着就是"收起后整列图标往左歪"，而且歪不歪还取决于行程有几天（内容短到不出
              滚动条时它又是正的）。48px 的图标轨道不需要那根条，滚轮/触控板/键盘照样能滚；
              展开层那条留着 —— 那边是正经的目录，该有滚动反馈。
            */}
            <nav className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {groups.map((g) => {
                const bigActive = activeSection === g.key;
                return (
                  <div key={g.key} className="flex flex-col items-center">
                    {/*
                      大类图标。mt-1.5(6) + h-9(36) 之后中心落在距组顶 24 的地方，正对上
                      展开层那个大标题行的中心（组 py-0.5 的 2 + 标题行 44 的一半 22）——
                      见上面导航那段注释。
                      h-5 不是 h-4：子项图标为了对齐放大到了 h-4，大类图标不跟着涨一档，
                      "组 > 子项"这层关系就没了（按钮本身没有底色，看着的大小就是图标的大小）。
                    */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => scrollTo(g.key)}
                          className={cn(
                            "h-9 w-9 mt-1.5 flex items-center justify-center rounded-md transition-colors",
                            bigActive
                              ? "bg-gray-900 text-white"
                              : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
                          )}
                        >
                          <g.icon className="h-5 w-5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        {g.label}
                      </TooltipContent>
                    </Tooltip>

                    {/* 子项。mt-2/mb-1/gap-0.5 是上面算好的那三个数（8 / 4 / 2） */}
                    {g.subs.length > 0 && (
                      <div className="flex flex-col items-center gap-0.5 mt-2 mb-1">
                        {g.subs.map((s) => {
                          // 同上：预算那个"查看"跟着大类一起亮（s.id === g.key）
                          const subActive =
                            bigActive &&
                            (activeSubId === s.id || s.id === g.key);

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

                          /*
                            概览/预算子项：**画各自的图标**，不再画圆点。

                            圆点只说明"这儿还有一项"，说明不了是哪一项 —— 概览底下
                            Notes / Flights / Hotels / Trains / 各个地点列表全是同一个点，
                            收起侧栏后根本分不出谁是谁，六个点等于六个"有东西"。
                            每个 SubItem 本来就带着自己的图标（见上面 overviewSubs），
                            展开态不用它是因为那儿有文字，这里恰好反过来：文字没了，
                            图标是唯一的身份。两层是互补的，不是两套写法。
                          */
                          return (
                            <Tooltip key={s.id}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  /*
                                    aria-label 不能省：对读屏来说这只是个"按钮"，而
                                    Tooltip 只挂在 aria-describedby 上（那是描述不是名字），
                                    少了它这一列就是六个无名按钮。
                                  */
                                  aria-label={s.label}
                                  onClick={() => scrollTo(s.id)}
                                  className={cn(
                                    // h-9 = 展开态一条子项的高度（text-base 行高 24 + py-1.5×2）
                                    "h-9 w-9 flex items-center justify-center rounded-md transition-colors",
                                    subActive
                                      ? "text-gray-900"
                                      : "text-gray-300 hover:text-gray-500",
                                  )}
                                >
                                  {/* h-4：跟展开态的文字同一档，比大类图标的 h-5 小一档 */}
                                  <s.icon className="h-4 w-4" />
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

        {/*
          AI 助手按钮：**故意长在 <aside> 外面**。
          <aside> 必须 overflow-hidden —— 展开/收起那个"拉窗帘"就靠它裁住固定 192px 宽的
          两层内容，所以放进 aside 里的东西只能在侧栏框内。而这里要的恰恰是两头都探出去：
          左边探出屏幕（侧栏紧贴屏幕左沿，探出去的那截被最外层的 overflow-hidden 切掉，
          看着像镶在边上），右边的圆弧压到正文那一列上面。

          所以它和 <aside> 平级、绝对定位在壳上：-left-4 / -right-4 两边各探出 16px，
          h-14 是"放大"后的高度（配 h-18 的顶部空档）。收起时跟展开层一起淡出
          （同一个时长，交叉淡出），并补 inert 摘出 Tab 序 —— opacity-0 的元素照样能 Tab 到。

          **两头圆角不对称**：右边 rounded-r-full，左边 rounded-l-none（直角）。这是必须的，
          不是造型选择 —— h-14 上 rounded-full 等于四个角都是 28px 半径，而左边只探出屏幕
          16px，28 > 16，屏幕边缘那一刀正好切在弧中间：左端会留下 12px 的弧段，而且按钮在
          屏幕边缘处只有 2×√(28²-12²) ≈ 50.6px 高（不是 56），看着就是"左边没顶到边、还带
          一点弧度"。左边改成直角，那 16px 全在屏幕外，边缘处就是一条 56px 的直线。

          为什么写 rounded-r-full + rounded-l-none、而不是 rounded-full + rounded-l-none：
          后者两个类都在设左边两个角，谁赢只看 Tailwind 生成的先后（同优先级），太脆。
          拆成"只右"和"只左"两组，互不冲突，结果确定。

          z-30：正文列里那张封面图是 relative，同层里按 DOM 序排在后面，不抬 z 会被它盖住。

          抽屉模式（手机）整个 hidden：这颗胶囊是"侧栏边缘探出来的半个球"，前提是侧栏
          在屏幕左沿；手机上侧栏常态是关着的，那个位置改由正文左上角两枚圆钮承担
          （见 TripWorkspace），这边留着会和它们叠在一起。
        */}
        <Button
          onClick={onAiClick}
          inert={isCollapsed}
          className={cn(
            "absolute -left-4 -right-4 top-4 z-30 h-14 gap-2 rounded-r-full rounded-l-none",
            "bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-md",
            "hover:from-orange-600 hover:to-pink-600 hover:shadow-lg",
            "transition-all motion-reduce:transition-none",
            isCollapsed && "pointer-events-none opacity-0",
            variant === "drawer" && "hidden",
          )}
        >
          {/* size-6，理由同上面折叠态那个图标（避开基类的 size-4 覆盖） */}
          <Sparkles className="size-6" />
          <span className="text-lg font-bold">AI 助手</span>
        </Button>
      </div>
    </TooltipProvider>
  );
}
