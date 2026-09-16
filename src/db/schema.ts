import {
  pgTable,
  text,
  timestamp,
  date,
  jsonb,
  doublePrecision,
  uuid,
  integer,
  boolean,
  check,
  uniqueIndex,
  primaryKey,
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
  // 地图图层里被"关掉"的图层键（'l:<listId>' / 'd:<dayDate>'，见 types/place 的 layerKey）。
  // 存"关掉的"而不是"打开的"：新加的列表 / 新增的一天天然是打开的，
  // 不用在每次建列表、改行程日期时回来补一行。
  hiddenLayers: jsonb("hidden_layers").$type<string[]>().notNull().default([]),
  coverImageUrl: text("cover_image_url"), // 网络图片 URL（Unsplash 等）
  coverImageData: text("cover_image_data"), // 本地图片 base64 data URI
  // 预算设置（可选）
  budget: doublePrecision("budget"), // 行程总预算
  budgetCurrency: text("budget_currency").default("CNY"), // 预算币种
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
 * place_items —— "地点实例"：一份地点只属于一个容器
 * （某个地点列表 list_id，或行程里的某一天 day_date，二选一，
 *  数据库层 CHECK 保证）。同一个 POI 想出现在多个容器时，
 *  各自持有一份独立实例（复制），可各自编辑笔记/时间/费用等。
 *  group_key = source_id ?? `${lng},${lat}` ?? name，用于在
 *  "该 POI 出现在哪些图层"时把同 POI 的多份实例归并。
 * ============================================================ */
export const placeItems = pgTable(
  "place_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    groupKey: text("group_key"), // 图层归并键（同 POI 的多份实例共享）
    // 自动生成来源：航班/酒店添加时自动挂的地点实例带（'flight'/'hotel' + 父行 id），
    // 删除该航班/酒店时级联删除；手动添加的为 null
    sourceKind: text("source_kind"),
    sourceId: text("source_id"),
    // POI 快照（复制到每份实例，各自独立演进）
    name: text("name").notNull(),
    address: text("address"),
    tel: text("tel"),
    type: text("type"),
    photo: text("photo"),
    lng: doublePrecision("lng"),
    lat: doublePrecision("lat"),
    // 容器：list 或 day 二选一
    listId: uuid("list_id").references(() => lists.id, {
      onDelete: "cascade",
    }),
    dayDate: text("day_date"), // "YYYY-MM-DD"
    position: integer("position").notNull().default(0), // 容器内的排序（序号 = 排序后的位次）
    // 可编辑内容
    note: text("note").notNull().default(""),
    // 地点简介。和 note 的分工：note 是"我自己的备忘"（显示在收起态的卡上，
    // 记的是要做的事）；description 是"这个地方是什么"（显示在详情卡里，
    // 由 AI 生成或手写，属于资料而非待办）。
    description: text("description"),
    timeFrom: text("time_from"), // "HH:mm"
    timeTo: text("time_to"), // "HH:mm"
    url: text("url"), // 附件粘贴链接
    visited: boolean("visited").notNull().default(false),
    // 从这份实例到"下一份实例"的交通方式（'walking'|'transit'|'driving'）。
    // 之所以挂在起点这一行上，是因为"怎么走"描述的是它和下一个地点之间的关系，
    // 跟着起点卡走；换天/拖动排序后语义自然跟着变，不需要另建一张"间隔表"。
    // null = 没单独设过，用行程默认方式（见 lib/place-route 的 routeModeOf）。
    routeModeToNext: text("route_mode_to_next"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "place_items_container_check",
      sql`(${t.listId} IS NULL) <> (${t.dayDate} IS NULL)`,
    ),
  ],
);

export type PlaceItem = typeof placeItems.$inferSelect;
export type NewPlaceItem = typeof placeItems.$inferInsert;

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
  from: text("from").notNull(), // 出发城市（中文）
  fromCity: text("from_city").notNull(), // 出发机场名（中文）
  fromCode: text("from_code"), // 出发机场三字码；从机场表里选中的才有，手打的为 null
  to: text("to").notNull(), // 到达城市（中文）
  toCity: text("to_city").notNull(), // 到达机场名（中文）
  toCode: text("to_code"), // 到达机场三字码；同上
  date: text("date").notNull(), // "2024-03-15"（出发日，展示用）
  departureTime: text("departure_time").notNull(), // "HH:mm"（北京时间）
  arrivalTime: text("arrival_time").notNull(), // "HH:mm"（北京时间）
  flightNumber: text("flight_number").notNull(),
  airline: text("airline"), // 航司名；API 查回来的会带上，老数据为 null，手动编辑也可留空
  position: integer("position").notNull().default(0),
  // 新增字段：用于自动添加机场地点
  arrivalDate: text("arrival_date"), // "2024-09-24"（用于匹配 day）
  arrivalLng: doublePrecision("arrival_lng"), // 到达机场经度
  arrivalLat: doublePrecision("arrival_lat"), // 到达机场纬度
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
  checkIn: text("check_in").notNull(), // "2024-09-20"（入住日）
  checkOut: text("check_out").notNull(), // "2024-09-22"（退房日）
  position: integer("position").notNull().default(0),
  // 新增字段：用于自动添加酒店地点
  checkInDate: text("check_in_date"), // "2024-09-24"（用于匹配 day）
  lng: doublePrecision("lng"), // 酒店经度
  lat: doublePrecision("lat"), // 酒店纬度
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

/* ============================================================
 * chat_messages —— AI 助手的对话记录
 * 一条消息一行，按 created_at 升序就是对话顺序（天然追加，
 * 不需要 position）。只记 role/content/model：
 * **API Key 永远不进这张表** —— 它是用户自己的钱，只留在浏览器 localStorage。
 * ============================================================ */
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  // 这条是哪个模型产的，写成 "厂商:模型"（如 "glm:glm-5.2"）。
  // 用户消息没有模型，为 null。留着以后对比不同模型的表现。
  model: text("model"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

/* ============================================================
 * route_plans —— 两地点之间"怎么走"的缓存（时长 / 距离 / 折线）
 * 纯缓存，键就是 (trip_id, route_key)，所以不另设代理主键。
 *
 * route_key = `起点lng,lat>终点lng,lat|模式`（见 lib/place-route 的 routeKey），
 * **按坐标而不是卡片 id 记** —— 拖动排序、复制副本、换天都不影响它命中，
 * 只有地点真的被挪动（坐标变了）才会失效。
 *
 * distance 为 null 表示"查过、高德没给方案"（如跨城公交），属于负缓存；
 * 行不存在才是"没查过"。靠这一点省掉一个 status 列。
 * 折线一并入库：卡片上那行和地图上那条线读的是同一行，不会一个新一个旧。
 * ============================================================ */
export const routePlans = pgTable(
  "route_plans",
  {
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    routeKey: text("route_key").notNull(),
    mode: text("mode").notNull(), // 与 route_key 的后缀同源，单独留一份，读的时候不必去拆 key
    distance: doublePrecision("distance"), // 米；null = 无方案
    duration: integer("duration"), // 秒；null = 无方案（不叫 time，免得和 pg 的 time 类型混淆）
    path: jsonb("path").$type<[number, number][]>(), // [lng,lat][]；null = 无方案，[] = 有方案但解析不出几何
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(), // 读的时候按它判过期（见 ROUTE_CACHE_TTL_DAYS）
  },
  (t) => [primaryKey({ columns: [t.tripId, t.routeKey] })],
);

export type RoutePlanRow = typeof routePlans.$inferSelect;
export type NewRoutePlanRow = typeof routePlans.$inferInsert;

/* ============================================================
 * trip_members —— 行程成员（用于费用分摊）
 * 存储参与行程的成员信息（email + 显示名 + 头像）。
 * position 控制展示顺序，每个行程各有独立的成员列表。
 * ============================================================ */
export const tripMembers = pgTable(
  "trip_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    email: text("email").notNull(), // 成员邮箱（唯一标识）
    displayName: text("display_name").notNull(), // 显示名称
    avatar: text("avatar"), // 头像 URL（可选）
    position: integer("position").notNull().default(0), // 展示顺序
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // 同一行程内成员邮箱唯一
    uniqueIndex("trip_members_trip_email_unique").on(t.tripId, t.email),
  ],
);

export type TripMember = typeof tripMembers.$inferSelect;
export type NewTripMember = typeof tripMembers.$inferInsert;

/* ============================================================
 * expenses —— 费用记录
 * 记录行程中的每一笔费用，支持关联行程项目（航班/住宿/地点）、
 * 指定付款人、配置分摊成员。
 * ============================================================ */
export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  amount: doublePrecision("amount").notNull(), // 金额
  currency: text("currency").notNull().default("CNY"), // 币种，默认人民币
  category: text("category").notNull(), // 类别（航班/住宿/租车等11个）
  name: text("name").notNull(), // 费用名称（如"北京-上海机票"）
  description: text("description"), // 可选的详细说明
  date: date("date"), // 费用发生日期（可选，"YYYY-MM-DD"）
  // 付款人（指向 trip_members.id）
  paidBy: uuid("paid_by")
    .notNull()
    .references(() => tripMembers.id, { onDelete: "restrict" }),
  // 分摊成员 ID 列表（jsonb 数组，存 trip_members.id[]）
  // 空数组表示"不分摊"（只有付款人自己承担）
  splitWith: jsonb("split_with").$type<string[]>().notNull().default([]),
  // 关联的行程项目（可选，用于从卡片快捷添加时自动填充）
  linkedItemType: text("linked_item_type"), // 'flight' | 'hotel' | 'place'
  linkedItemId: text("linked_item_id"), // 对应表的行 id
  position: integer("position").notNull().default(0), // 列表内排序
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
