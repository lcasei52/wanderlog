"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Flight, Hotel, NewFlight, NewHotel } from "@/db/schema";
import { useHistory, useRegisterSnapshot } from "@/context/history-context";
import { usePlaces } from "@/context/places-context";
import { useExpenses } from "@/context/expenses-context";
import {
  createFlight,
  deleteFlightById,
  reorderFlights as reorderFlightsAction,
  updateFlightById,
  type FlightPatch,
} from "@/actions/flights";
import {
  createHotel,
  deleteHotelById,
  reorderHotels as reorderHotelsAction,
  updateHotelById,
  type HotelPatch,
} from "@/actions/hotels";

/**
 * 按给定 id 顺序重排数组，并把新下标**写回每行的 position**。
 *
 * position 必须写进对象本身，不能只靠数组顺序：撤销栈的快照存的就是这些行，
 * 同步回库时按每行的 position 逐行写 —— 只重排数组的话，界面是新顺序、写回库里
 * 的还是旧顺序，一刷新就翻回去。（places 的 reorderItems 一直是这么做的。）
 *
 * 不在传入列表里的行（正常不会出现）保持原 position，排在后面。
 */
function reorderRows<T extends { id: string; position: number }>(
  rows: T[],
  orderedIds: string[],
): T[] {
  const order = new Map(orderedIds.map((id, i) => [id, i]));
  return rows
    .map((row) => {
      const index = order.get(row.id);
      return index === undefined ? row : { ...row, position: index };
    })
    .sort(
      (a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity),
    );
}

export type BookingVariant = "flights" | "hotels";

interface BookingsContextValue {
  tripId: string;
  flights: Flight[];
  hotels: Hotel[];
  /** 概览区 Flights/Hotels 两节的展开态（BookingCard 与列表共用） */
  expanded: Record<BookingVariant, boolean>;
  setExpanded: (variant: BookingVariant, value: boolean) => void;
  toggleExpanded: (variant: BookingVariant) => void;
  addFlight: (data: Omit<NewFlight, "tripId">) => Promise<Flight | null>;
  /** 改航班卡展开后表单里的字段；返回更新后的整行，失败/未命中返回 null */
  updateFlight: (id: string, patch: FlightPatch) => Promise<Flight | null>;
  deleteFlight: (id: string) => Promise<void>;
  addHotel: (data: Omit<NewHotel, "tripId">) => Promise<Hotel | null>;
  /** 改住宿卡展开后表单里的字段；返回更新后的整行，失败/未命中返回 null */
  updateHotel: (id: string, patch: HotelPatch) => Promise<Hotel | null>;
  deleteHotel: (id: string) => Promise<void>;
  /** 拖拽排序：传入列表的完整 id 顺序，本地先重排再落库 */
  reorderFlights: (orderedIds: string[]) => Promise<void>;
  reorderHotels: (orderedIds: string[]) => Promise<void>;
}

const BookingsContext = createContext<BookingsContextValue | null>(null);

/*
 * 航班/住宿进撤销栈，快照里那一片叫 "bookings"（两张表装在一起）。
 *
 * ★ 删航班/删住宿是这里最要紧的一处：它们会级联删掉自动生成的机场/酒店地点和记在
 * 上面费用。以前那两样在快照里、航班不在，撤销时航班没回来、它的后果却回来了。
 * 所以现在**连带清理也收进 deleteFlight/deleteHotel 里**（不再由 FlightsList /
 * HotelsList 各调一次）—— 一个动作的后果集中在一处，撤销栈才不会漏记一半。
 */
export function BookingsProvider({
  tripId,
  flights: seedFlights,
  hotels: seedHotels,
  children,
}: {
  tripId: string;
  flights: Flight[];
  hotels: Hotel[];
  children: ReactNode;
}) {
  const [flights, setFlights] = useState<Flight[]>(seedFlights);
  const [hotels, setHotels] = useState<Hotel[]>(seedHotels);
  const [expanded, setExpandedState] = useState<Record<BookingVariant, boolean>>({
    flights: true,
    hotels: true,
  });

  const { push } = useHistory();
  useRegisterSnapshot(
    "bookings",
    () => ({ flights, hotels }),
    (slice) => {
      setFlights(slice.flights);
      setHotels(slice.hotels);
    },
  );

  /*
   * 删航班/住宿时要顺手清掉的两样本地态，它们在**外层**的 PlacesProvider /
   * ExpensesProvider 里（本 Provider 是它们的内层，见 TripWorkspace 的顺序，别调过来）。
   *
   * 存进 ref 而不是直接进 deleteFlight 的依赖数组：removeItemsBySource 的身份会跟着
   * 地点数据变，依赖它会让 deleteFlight 每次加个地点就换一次身份，进而把整个
   * BookingsProvider 的 value 也换掉、所有消费方跟着重渲染。这里要的只是"最新的那一个"。
   */
  const { removeItemsBySource } = usePlaces();
  const { removeExpensesByLinkedItem } = useExpenses();
  const cleanupRef = useRef({ removeItemsBySource, removeExpensesByLinkedItem });
  useLayoutEffect(() => {
    cleanupRef.current = { removeItemsBySource, removeExpensesByLinkedItem };
  });

  const setExpanded = useCallback(
    (variant: BookingVariant, value: boolean) =>
      setExpandedState((prev) => ({ ...prev, [variant]: value })),
    [],
  );
  const toggleExpanded = useCallback(
    (variant: BookingVariant) =>
      setExpandedState((prev) => ({ ...prev, [variant]: !prev[variant] })),
    [],
  );

  /*
   * 下面这些 mutator 一律**先 push 再动手**（见 history-context 顶部规矩三）。
   * 新增航班/住宿还会连带挂出机场/酒店地点，那几步由调用方包在 batch() 里，
   * 所以一次"加航班"只留下一份快照（这里是那一份，因为它是批次里的第一个 push）。
   */
  const addFlight = useCallback(
    async (data: Omit<NewFlight, "tripId">) => {
      push();
      try {
        const row = await createFlight(tripId, data);
        setFlights((prev) => [...prev, row]);
        return row;
      } catch (err) {
        console.error("新增航班失败:", err);
        return null;
      }
    },
    [tripId, push],
  );

  const updateFlight = useCallback(
    async (id: string, patch: FlightPatch) => {
      push();
      try {
        const row = await updateFlightById(id, patch);
        if (!row) return null;
        setFlights((prev) => prev.map((f) => (f.id === id ? row : f)));
        return row;
      } catch (err) {
        console.error("更新航班失败:", err);
        return null;
      }
    },
    [push],
  );

  const deleteFlight = useCallback(async (id: string) => {
    push();
    try {
      await deleteFlightById(id);
      setFlights((prev) => prev.filter((f) => f.id !== id));
      // 服务端已经把机场地点和费用一起删了（见 deleteFlightById），本地跟着清。
      // 这两个清理**不**自己 push：它们是这次删除的后果，快照已经由上面那一行记过。
      cleanupRef.current.removeItemsBySource("flight", id);
      cleanupRef.current.removeExpensesByLinkedItem("flight", id);
    } catch (err) {
      console.error("删除航班失败:", err);
    }
  }, [push]);

  const addHotel = useCallback(
    async (data: Omit<NewHotel, "tripId">) => {
      push();
      try {
        const row = await createHotel(tripId, data);
        setHotels((prev) => [...prev, row]);
        return row;
      } catch (err) {
        console.error("新增住宿失败:", err);
        return null;
      }
    },
    [tripId, push],
  );

  const updateHotel = useCallback(
    async (id: string, patch: HotelPatch) => {
      push();
      try {
        const row = await updateHotelById(id, patch);
        if (!row) return null;
        setHotels((prev) => prev.map((h) => (h.id === id ? row : h)));
        return row;
      } catch (err) {
        console.error("更新住宿失败:", err);
        return null;
      }
    },
    [push],
  );

  const deleteHotel = useCallback(async (id: string) => {
    push();
    try {
      await deleteHotelById(id);
      setHotels((prev) => prev.filter((h) => h.id !== id));
      // 同 deleteFlight：酒店地点与费用的本地清理收在这里，不再由 HotelsList 各调一次
      cleanupRef.current.removeItemsBySource("hotel", id);
      cleanupRef.current.removeExpensesByLinkedItem("hotel", id);
    } catch (err) {
      console.error("删除住宿失败:", err);
    }
  }, [push]);

  const reorderFlights = useCallback(
    async (orderedIds: string[]) => {
      push();
      setFlights((prev) => reorderRows(prev, orderedIds));
      try {
        await reorderFlightsAction(tripId, orderedIds);
      } catch (err) {
        console.error("航班排序失败:", err);
      }
    },
    [tripId, push],
  );

  const reorderHotels = useCallback(
    async (orderedIds: string[]) => {
      push();
      setHotels((prev) => reorderRows(prev, orderedIds));
      try {
        await reorderHotelsAction(tripId, orderedIds);
      } catch (err) {
        console.error("住宿排序失败:", err);
      }
    },
    [tripId, push],
  );

  const value = useMemo<BookingsContextValue>(
    () => ({
      tripId,
      flights,
      hotels,
      expanded,
      setExpanded,
      toggleExpanded,
      addFlight,
      updateFlight,
      deleteFlight,
      addHotel,
      updateHotel,
      deleteHotel,
      reorderFlights,
      reorderHotels,
    }),
    [
      tripId,
      flights,
      hotels,
      expanded,
      setExpanded,
      toggleExpanded,
      addFlight,
      updateFlight,
      deleteFlight,
      addHotel,
      updateHotel,
      deleteHotel,
      reorderFlights,
      reorderHotels,
    ],
  );

  return (
    <BookingsContext.Provider value={value}>{children}</BookingsContext.Provider>
  );
}

export function useBookings(): BookingsContextValue {
  const ctx = useContext(BookingsContext);
  if (!ctx) {
    throw new Error("useBookings 必须在 <BookingsProvider> 内使用");
  }
  return ctx;
}
