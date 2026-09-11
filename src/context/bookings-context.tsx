"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Flight, Hotel, NewFlight, NewHotel } from "@/db/schema";
import {
  createFlight,
  deleteFlightById,
  reorderFlights as reorderFlightsAction,
} from "@/actions/flights";
import {
  createHotel,
  deleteHotelById,
  reorderHotels as reorderHotelsAction,
} from "@/actions/hotels";

/** 按给定 id 顺序重排数组；不在列表里的行保持在后（正常不会出现） */
function sortByIds<T extends { id: string }>(rows: T[], orderedIds: string[]): T[] {
  const order = new Map(orderedIds.map((id, i) => [id, i]));
  return [...rows].sort(
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
  deleteFlight: (id: string) => Promise<void>;
  addHotel: (data: Omit<NewHotel, "tripId">) => Promise<Hotel | null>;
  deleteHotel: (id: string) => Promise<void>;
  /** 拖拽排序：传入列表的完整 id 顺序，本地先重排再落库 */
  reorderFlights: (orderedIds: string[]) => Promise<void>;
  reorderHotels: (orderedIds: string[]) => Promise<void>;
}

const BookingsContext = createContext<BookingsContextValue | null>(null);

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

  const addFlight = useCallback(
    async (data: Omit<NewFlight, "tripId">) => {
      try {
        const row = await createFlight(tripId, data);
        setFlights((prev) => [...prev, row]);
        return row;
      } catch (err) {
        console.error("新增航班失败:", err);
        return null;
      }
    },
    [tripId],
  );

  const deleteFlight = useCallback(async (id: string) => {
    try {
      await deleteFlightById(id);
      setFlights((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      console.error("删除航班失败:", err);
    }
  }, []);

  const addHotel = useCallback(
    async (data: Omit<NewHotel, "tripId">) => {
      try {
        const row = await createHotel(tripId, data);
        setHotels((prev) => [...prev, row]);
        return row;
      } catch (err) {
        console.error("新增住宿失败:", err);
        return null;
      }
    },
    [tripId],
  );

  const deleteHotel = useCallback(async (id: string) => {
    try {
      await deleteHotelById(id);
      setHotels((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      console.error("删除住宿失败:", err);
    }
  }, []);

  const reorderFlights = useCallback(
    async (orderedIds: string[]) => {
      setFlights((prev) => sortByIds(prev, orderedIds));
      try {
        await reorderFlightsAction(tripId, orderedIds);
      } catch (err) {
        console.error("航班排序失败:", err);
      }
    },
    [tripId],
  );

  const reorderHotels = useCallback(
    async (orderedIds: string[]) => {
      setHotels((prev) => sortByIds(prev, orderedIds));
      try {
        await reorderHotelsAction(tripId, orderedIds);
      } catch (err) {
        console.error("住宿排序失败:", err);
      }
    },
    [tripId],
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
      deleteFlight,
      addHotel,
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
      deleteFlight,
      addHotel,
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
