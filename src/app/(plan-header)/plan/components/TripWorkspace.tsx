"use client";

import { useState } from "react";
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
                  <div className="flex flex-1 overflow-hidden">
                    {/* 左侧：header + sidebar + detail */}
                    <div className="flex flex-col h-full">
                      <PlanHeader />
                      <div className="flex flex-1 overflow-hidden">
                        <SimpleSidebar
                          trip={trip}
                          activeSection={active.section}
                          activeSubId={active.subId}
                          onAiClick={() => setIsAiOpen(true)}
                        />
                        {/* notes 不用再往下传：NotesList 直接从 NotesProvider 取 */}
                        <DetailContent trip={trip} onActiveChange={setActive} />
                      </div>
                    </div>

                    {/* 右侧：地图占满全高 */}
                    <div className="relative flex-1 min-w-0">
                      <MapView
                        destinationCenter={destinationCenter}
                        hiddenLayers={hiddenLayers}
                      />
                    </div>
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
