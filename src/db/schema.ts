import {
  pgTable,
  text,
  timestamp,
  date,
  jsonb,
  doublePrecision,
  uuid,
  integer,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ============================================================
 * trips —— 行程（主干字段）
 * 说明：用户/鉴权暂缓，受邀邮箱先存 jsonb；startDate/endDate
 *       同时作为行程总览摘要，days 表由它生成并保持同步。
 * ============================================================ */
export const trips = pgTable("trips", {
  id: text("id").primaryKey(), // 由调用方生成（uuid / 种子里的固定 id）
  name: text("name").notNull(),
  destinationName: text("destination_name"),
  destinationLng: doublePrecision("destination_lng"),
  destinationLat: doublePrecision("destination_lat"),
  destinationType: text("destination_type"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  privacy: text("privacy").notNull().default("private"),
  invitedEmails: jsonb("invited_emails").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;

/* ============================================================
 * lists —— 概览区「地点列表」
 * 只存用户的地点列表（一个行程可有多个，position 决定顺序）。
 * Notes / Flights / Hotels 不再占本表：它们各有内容表
 * （notes / flights / hotels），直接 tripId 归属，有数据即有 section。
 * 地点经 plan_items 挂到某个地点列表(list_id) 或某天(day_id)。
 * ============================================================ */
export const lists = pgTable(
  "lists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    position: integer("position").notNull().default(0), // 概览区内的展示顺序
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // 同一行程内列表序号不重复（顺序语义交给 position，身份仍是 uuid）
    uniqueIndex("lists_trip_position_unique").on(t.tripId, t.position),
  ],
);

export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;

/* ============================================================
 * days —— 行程的每一天
 * 创建行程时按 startDate~endDate 生成；改期时增删。
 * position 与 date 都在行程内唯一，由数据库兜底。
 * ============================================================ */
export const days = pgTable(
  "days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    date: date("date").notNull(), // "YYYY-MM-DD"
    position: integer("position").notNull().default(0), // Day 1 = 0
    title: text("title"), // 可选，如"自由日"
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("days_trip_date_unique").on(t.tripId, t.date),
    uniqueIndex("days_trip_position_unique").on(t.tripId, t.position),
  ],
);

export type Day = typeof days.$inferSelect;
export type NewDay = typeof days.$inferInsert;

/* ============================================================
 * places —— 地点池（POI 级，一视同仁）
 * 只属于某个行程，不带 list/day 标签。同一个地点要出现在
 * 多个列表/天时复用同一行，通过 plan_items 记录"出现在哪"。
 * ============================================================ */
export const places = pgTable("places", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  lng: doublePrecision("lng"),
  lat: doublePrecision("lat"),
  sourceId: text("source_id"), // 高德 POI id
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;

/* ============================================================
 * plan_items —— 挂靠表：某个地点出现在某个地点列表/某天 + 顺序
 * list_id / day_id 恰好一个非空（数据库层 CHECK 保证）。
 * ============================================================ */
export const planItems = pgTable(
  "plan_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    listId: uuid("list_id").references(() => lists.id, {
      onDelete: "cascade",
    }),
    dayId: uuid("day_id").references(() => days.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0), // 容器内的排序
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "plan_items_container_check",
      sql`${t.listId} IS NOT NULL OR ${t.dayId} IS NOT NULL`,
    ),
  ],
);

export type PlanItem = typeof planItems.$inferSelect;
export type NewPlanItem = typeof planItems.$inferInsert;

/* ============================================================
 * flights / hotels / notes —— 各自独立的「一种 section」
 * 每个行程各有一套（当前产品形态：每 trip 一个航班/酒店/笔记
 * 集合）。直接 tripId 归属，不再有 list_id——"Flights 这个列表"
 * 就等于这张表里该 trip 的全部行。position 控制表内顺序。
 * ============================================================ */
export const flights = pgTable("flights", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  from: text("from"),
  fromCity: text("from_city"),
  to: text("to"),
  toCity: text("to_city"),
  date: text("date"), // "2024-03-15"
  departureTime: text("departure_time"),
  arrivalTime: text("arrival_time"),
  flightNumber: text("flight_number"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Flight = typeof flights.$inferSelect;
export type NewFlight = typeof flights.$inferInsert;

export const hotels = pgTable("hotels", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  checkIn: text("check_in"),
  checkOut: text("check_out"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Hotel = typeof hotels.$inferSelect;
export type NewHotel = typeof hotels.$inferInsert;

export const notes = pgTable("notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  content: text("content").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
