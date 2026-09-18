"use client";

import { useState } from "react";
import { Map as MapIcon, PanelLeft, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TripSummary } from "@/types/trip";
import type { Flight, Hotel, Train, Day, List, PlaceItem, Note, TripMember, Expense } from "@/db/schema";
import type { CachedRoutePlan } from "@/lib/place-route";
import { TripHistoryProvider } from "@/context/history-context";
import { NotesProvider } from "@/context/notes-context";
import { PlacesProvider } from "@/context/places-context";
import { BookingsProvider } from "@/context/bookings-context";
import { RoutesProvider } from "@/context/routes-context";
import { MembersProvider } from "@/context/members-context";
import { ExpensesProvider } from "@/context/expenses-context";
import SimpleSidebar from "./SimpleSidebar";
import DetailContent from "./DetailContent";
import MapView from "./MapView";
import UndoRedoButtons from "./UndoRedoButtons";
import PlanHeader from "./PlanHeader";
import AiAssistant from "./AiAssistant";
import MobileSidebar from "./MobileSidebar";

interface TripWorkspaceProps {
  /** 来自服务端 page 的可序列化行程快照 */
  trip: TripSummary;
  /** 该行程已入库的航班 / 住宿 / 火车（BookingsProvider 初值） */
  flights: Flight[];
  hotels: Hotel[];
  trains: Train[];
  /** 该行程的 days 行（PlacesProvider 初值，只用来取每天那个副标题 days.title） */
  days: Day[];
  /** 该行程的成员和费用（MembersProvider / ExpensesProvider 初值） */
  tripMembers: TripMember[];
  expenses: Expense[];
  /** 该行程已入库的地点实例 / 地点列表（PlacesProvider 初值） */
  placeItems: PlaceItem[];
  placeLists: List[];
  /** 该行程的笔记 */
  notes: Note[];
  /** 已入库的路线缓存（route_plans），灌进 RoutesProvider 省掉重复查询 */
  routePlans: CachedRoutePlan[];
  /** 地图图层里被关掉的那些（trips.hidden_layers），地图列每次改动都会回写 */
  hiddenLayers: string[];
  /**
   * 各地点列表 / 各天的主色（trips.container_colors），键 = 图层键。
   * 跟 hiddenLayers 同表、同一种"初值"角色，但这一份进撤销快照（见 places-context）。
   */
  containerColors: Record<string, string>;
  /** 行程目的地的中心坐标 [lng, lat]（无则不给） */
  destinationCenter?: [number, number];
}

/**
 * 详情页三列布局的 client 边界：把 SimpleSidebar / DetailContent / MapView
 * 都包进 Provider，让地点实例/选中态、航班/住宿增删、成员与费用共享。
 * 地图列用 relative 壳包住 MapView 和浮在上面的 PlaceDetailCard。
 *
 * ★ TripHistoryProvider 必须在**所有**功能 provider 的最外面：撤销栈要能同时够到
 * 地点/费用/航班住宿/笔记，各功能把自己那一片注册进去（见 history-context 顶部契约）。
 * 往它里面、各功能外面塞新 provider 都行，但别把任何**要进快照**的功能挪到它外面去。
 *
 * Members/Expenses 放在最外层：预算卡与费用列表要读成员做分摊结算，
 * 而降级路径上它们不依赖地点/航班，包在外面谁都能取到。
 */
export default function TripWorkspace({
  trip,
  flights,
  hotels,
  trains,
  days,
  tripMembers,
  expenses,
  placeItems,
  placeLists,
  notes,
  routePlans,
  hiddenLayers,
  containerColors,
  destinationCenter,
}: TripWorkspaceProps) {
  // 详情页滚动到哪 → 侧边栏高亮到哪（scrollspy）
  const [active, setActive] = useState<{
    section: string | null;
    subId: string | null;
  }>({ section: "overview", subId: null });

  // AI 助手侧边栏状态
  const [isAiOpen, setIsAiOpen] = useState(false);

  /*
   * 手机端的两个浮层。桌面端（lg 以上）这两个恒为 false 也无人读 —— 那边的抽屉和
   * 地图浮层整个被 lg:hidden / lg:relative 那套顶掉了。
   *
   * 互斥是有意的：两个都是铺满或半铺满屏的大浮层，抽屉的遮罩(z-40)本来就压在地图浮层
   * (z-30)上面，真让它们同时开着，用户面对的是"抽屉盖着地图、关上抽屉露出地图"这种
   * 没人要求的中间态。所以开一个就顺手关掉另一个。
   */
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);

  const openSidebar = () => {
    setIsMapOpen(false);
    setIsSidebarOpen(true);
  };
  const openMap = () => {
    setIsSidebarOpen(false);
    setIsMapOpen(true);
  };
  // 手机点 ✨ 时也把两个浮层收掉，免得 AI 面板从地图底下钻出来
  const openAi = () => {
    setIsSidebarOpen(false);
    setIsMapOpen(false);
    setIsAiOpen(true);
  };

  return (
    <TripHistoryProvider tripId={trip.id}>
      {/* 笔记谁也不依赖，放在最靠里那层；只要在 TripHistoryProvider 里面就能进快照 */}
      <NotesProvider tripId={trip.id} notes={notes}>
        <MembersProvider tripId={trip.id} members={tripMembers}>
          <ExpensesProvider tripId={trip.id} expenses={expenses}>
            <PlacesProvider
              tripId={trip.id}
              tripDates={{ startDate: trip.startDate, endDate: trip.endDate }}
              seeds={{
                items: placeItems,
                placeLists,
                dayRows: days,
                containerColors,
              }}
            >
              <UndoRedoButtons />
              <BookingsProvider
                tripId={trip.id}
                flights={flights}
                hotels={hotels}
                trains={trains}
              >
                {/* 路线缓存/隐藏态/地图画线开关由行程列（间隔那行）与地图列（那些线）共享。
                    城市只给公交查询用（高德的公交必须有城市），拿行程目的地顶上；
                    库里已有的路线（routePlans）作为初值灌进去，重开行程就不用再问高德了。 */}
                <RoutesProvider
                  tripId={trip.id}
                  initialPlans={routePlans}
                  city={trip.destination?.name ?? null}
                >
                  {/*
                    手机布局总览（lg 以下）：
                      正文 DetailContent 独占整屏（默认态）；侧栏是 left 抽屉（MobileSidebar，
                      fixed）；地图是 absolute inset-0 的整屏浮层，从右边滑进来。
                    三者互斥，state 在上面。

                    relative 加在这一层：它当两个 absolute 浮层（地图、两枚圆钮、底部按钮）
                    的定位父级。**不能**给任何祖先加 transform/filter —— 抽屉/遮罩/AI 面板
                    都是 fixed，一旦有祖先带 transform，它们就改以那个祖先为基准，全部跑偏。
                  */}
                  <div className="relative flex flex-1 overflow-hidden">
                    {/*
                      左侧：header + sidebar + detail。
                      手机上它得独占整屏（这时地图已变成浮层、不在流里，没人跟它分宽度）；
                      lg 以上回到原来的 flex: 0 1 auto + min-width:auto —— flex-initial 就是
                      `flex: 0 1 auto` 本身，不是 flex-none(0 0 auto)：后者不收缩，桌面窄窗口下
                      左列会顶出去而不是让正文折行。
                    */}
                    <div className="flex flex-1 min-w-0 flex-col h-full lg:flex-initial lg:min-w-auto">
                      <PlanHeader />
                      <div className="relative flex flex-1 overflow-hidden">
                        <SimpleSidebar
                          trip={trip}
                          activeSection={active.section}
                          activeSubId={active.subId}
                          onAiClick={() => setIsAiOpen(true)}
                        />
                        {/* notes 不用再往下传：NotesList 直接从 NotesProvider 取 */}
                        <DetailContent trip={trip} onActiveChange={setActive} />

                        {/*
                          手机：侧栏收起时替掉那条 w-12 窄轨的两枚图标按钮。
                          top-3 落在 h-16 的 PlanHeader 正下方，跟桌面那颗 AI 胶囊同一个垂直位置。

                          **上下排列、贴着屏幕左沿**（用户要的"沿着左边缘伸出来的直线 + 圆弧"）：
                          就是桌面上那颗 AI 胶囊的造型 —— 左边 rounded-l-none 是一条直线、
                          右边 rounded-r-full 是个半圆。左沿切成直角不是造型选择，是必须的：
                          按钮紧贴屏幕边，round 出来的那截弧会正好被屏幕边缘切掉一段，
                          留下个"没顶到边、还带点弧"的怪样子（跟 SimpleSidebar 那颗胶囊同理，
                          那边是探出屏幕，这边是贴边）。

                          竖着排是为了不跟正文抢顶部的宽度：横排时这两枚要占掉 96px，
                          而 375px 上正文顶行本来就有内容。竖着贴边只占 48px，
                          而且是"从侧栏边上长出来"的那一块，读起来跟桌面那颗胶囊是同一个东西。

                          为什么宽度写 w-12 而不复用 size="icon"：Button 的 size 变体给的是
                          size-9，而 twMerge 里 size 组是**覆盖 w/h 的单向关系**
                          （conflictingClassGroups.size = ['w','h']）—— 后面的 w-12 顶不掉
                          前面的 size-9，两个都留在 class 里，谁赢只看 Tailwind 的产出顺序。
                          索性不传 size 变体、尺寸全自己写（默认变体那个 h-9 被后面的 h-10 顶掉，
                          同一组、方向正确）。桌面上那颗 h-14 的胶囊就是这么写的。
                        */}
                        <div className="absolute left-0 top-3 z-20 flex flex-col gap-2 lg:hidden">
                          <Button
                            onClick={openAi}
                            className="h-10 w-12 rounded-r-full rounded-l-none bg-linear-to-br from-orange-500 to-pink-500 text-white shadow-md hover:from-orange-600 hover:to-pink-600"
                            title="AI 助手"
                          >
                            {/* size-5 不能写成 h-5 w-5：Button 基类那条
                                [&_svg:not([class*='size-'])]:size-4 会把没写 size- 的图标压成 16px */}
                            <Sparkles className="size-5" />
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={openSidebar}
                            className="h-10 w-12 rounded-r-full rounded-l-none bg-white/80 text-gray-700 shadow-md backdrop-blur hover:bg-white"
                            title="展开侧边栏"
                          >
                            <PanelLeft className="size-5" />
                          </Button>
                        </div>

                        {/*
                          手机：底部黑色「打开地图视图」。
                          用 fixed 而不是 sticky —— 这一列的滚动容器是 DetailContent 的根，
                          sticky 在"内容不足一屏"时不会贴底，而 fixed 的祖先链上没有 transform，
                          直接贴视口底部，两种情况表现一致。

                          pointer-events-none 外壳 + 子元素 pointer-events-auto 是本仓库既有写法
                          （MapView 的图层按钮、PlaceDetailCard 都这么干）：外壳铺满整行好让按钮居中，
                          但不能挡住下面正文的点击。
                        */}
                        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center lg:hidden">
                          <Button
                            onClick={openMap}
                            className="pointer-events-auto h-11 gap-2 rounded-full bg-gray-900 px-5 text-white shadow-lg hover:bg-gray-800"
                          >
                            <MapIcon className="size-4" />
                            打开地图视图
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/*
                      地图列。桌面 = 流里的右列；手机 = 整屏浮层，从右侧滑入。

                      为什么用 translate + visibility 而不是 display:none / 条件卸载：
                      容器始终保持 inset-0 满尺寸，AMap 实例不用重建，useAMap 里那个
                      ResizeObserver 也不会误触发（否则会重跑"进入行程框选一次"，
                      用户退一次地图视野就被重置一次）。

                      两处都容易写错，各说一句：

                      ① 过渡的属性是 **translate**，不是 transform。
                      Tailwind v4 里 translate-x-* 走的是 CSS 的独立属性 `translate`
                      （translate: 100% 0），不是 `transform: translateX(100%)`。
                      transition-transform 能顺带管上它，是因为它展开成
                      "transform, translate, scale, rotate" 四项；而这里写的是**任意值**
                      transition-[...]，Tailwind 原样输出，写 transform 就真的只管 transform，
                      translate 不在列表里 → 开/关直接瞬移，一点动画都没有。

                      ② visibility 在 CSS 里是"离散但可过渡"的：visible → hidden 会在
                      duration 走完那一刻才翻过去。于是关地图时滑出动画照放，放完自动退出
                      Tab 序和无障碍树（visibility:hidden 的元素不可聚焦），
                      既不用 inert 也不用 JS 断点。开的时候立刻变 visible 再滑入。
                    */}
                    <div
                      className={cn(
                        "absolute inset-0 z-30 transition-[translate,visibility] duration-300 ease-out motion-reduce:transition-none",
                        isMapOpen ? "translate-x-0" : "translate-x-full invisible",
                        "lg:relative lg:inset-auto lg:z-auto lg:min-w-0 lg:flex-1",
                        "lg:visible lg:translate-x-0 lg:transition-none",
                      )}
                    >
                      <MapView
                        destinationCenter={destinationCenter}
                        hiddenLayers={hiddenLayers}
                        mobileOpen={isMapOpen}
                      />

                      {/*
                        退出地图。放在浮层**内部**，所以不用改 MapView 一行。
                        left-4 是有意的：MapView 自己的图层/缩放那组在右上角(top-4 right-4)，
                        各占一边不打架。这里 z-20 看似比浮层低，但浮层自身有 z-30 →
                        自成层叠上下文，内部比大小只看这一层。
                      */}
                      <Button
                        variant="secondary"
                        onClick={() => setIsMapOpen(false)}
                        className="absolute left-4 top-4 z-20 h-9 gap-1.5 rounded-full bg-gray-800/60 px-3 text-white backdrop-blur hover:bg-gray-800/80 lg:hidden"
                      >
                        <X className="size-4" />
                        退出地图
                      </Button>
                    </div>

                    {/*
                      手机侧栏抽屉。挂在这一层而不是左侧那个 flex 列里：
                      它是 fixed 浮层，跟"左侧列"的宽度/流没关系，且必须躲开任何
                      带 transform 的祖先。
                    */}
                    <MobileSidebar
                      open={isSidebarOpen}
                      onClose={() => setIsSidebarOpen(false)}
                      trip={trip}
                      activeSection={active.section}
                      activeSubId={active.subId}
                    />
                  </div>

                  {/* AI 助手侧边栏。tripId 用来读写对话记录；destination 只喂给 AI 当上下文。 */}
                  <AiAssistant
                    isOpen={isAiOpen}
                    onClose={() => setIsAiOpen(false)}
                    tripId={trip.id}
                    tripName={trip.name}
                    destination={trip.destination?.name}
                  />
                </RoutesProvider>
              </BookingsProvider>
            </PlacesProvider>
          </ExpensesProvider>
        </MembersProvider>
      </NotesProvider>
    </TripHistoryProvider>
  );
}
