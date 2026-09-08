/**
 * 种子脚本：把首页那批演示行程写入数据库。
 * 运行：npx tsx src/db/seed.ts
 *
 * id 与首页 mock 的 1..6 保持一致，保证 /plan/1 这类旧链接能查到。
 */
import { config } from "dotenv";
import { getDb } from "./client";
import { trips, type NewTrip } from "./schema";
import { ensureTripDays } from "./trip-days";

config({ path: ".env.local" });

const seedTrips: NewTrip[] = [
  {
    id: "1",
    name: "前往西宁的旅行",
    destinationName: "西宁",
    destinationLng: 101.7782,
    destinationLat: 36.6171,
    destinationType: "city",
    startDate: "2024-03-15",
    endDate: "2024-03-20",
    privacy: "private",
  },
  {
    id: "2",
    name: "巴黎浪漫之旅",
    destinationName: "巴黎",
    destinationLng: 2.3522,
    destinationLat: 48.8566,
    destinationType: "city",
    startDate: "2024-04-01",
    endDate: "2024-04-10",
    privacy: "private",
  },
  {
    id: "3",
    name: "东京樱花季",
    destinationName: "东京",
    destinationLng: 139.6917,
    destinationLat: 35.6895,
    destinationType: "city",
    startDate: "2024-03-25",
    endDate: "2024-03-30",
    privacy: "private",
  },
  {
    id: "4",
    name: "云南丽江古城游",
    destinationName: "丽江",
    destinationLng: 100.2301,
    destinationLat: 26.8721,
    destinationType: "city",
    startDate: "2024-05-01",
    endDate: "2024-05-05",
    privacy: "private",
  },
  {
    id: "5",
    name: "成都美食之旅",
    destinationName: "成都",
    destinationLng: 104.0665,
    destinationLat: 30.5723,
    destinationType: "city",
    startDate: "2024-06-10",
    endDate: "2024-06-15",
    privacy: "private",
  },
  {
    id: "6",
    name: "新疆自驾游",
    destinationName: "乌鲁木齐",
    destinationLng: 87.6168,
    destinationLat: 43.8256,
    destinationType: "city",
    startDate: "2024-07-01",
    endDate: "2024-07-15",
    privacy: "private",
  },
];

async function main() {
  const db = getDb();
  for (const trip of seedTrips) {
    // 已存在的（比如重复执行）跳过
    await db
      .insert(trips)
      .values(trip)
      .onConflictDoNothing({ target: trips.id });

    // 补全默认结构：按日期生成的 days
    await ensureTripDays(trip.id, trip.startDate, trip.endDate);
  }
  console.log(`Seed 完成：插入 ${seedTrips.length} 条行程（含按日期生成的 days）`);
}

main().catch((err) => {
  console.error("Seed 失败：", err);
  process.exit(1);
});
