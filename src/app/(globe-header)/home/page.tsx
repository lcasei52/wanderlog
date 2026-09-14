import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { trips } from "@/db/schema";
import HomeTrips from "./HomeTrips";

// 标签页标题：图案（src/app/icon.svg）+ 这句
export const metadata: Metadata = {
  title: "旅游路线规划小助手",
};

// 行程随时会被创建/删除：禁止静态化/缓存，每次请求实时查库
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rows = await getDb()
    .select({
      id: trips.id,
      name: trips.name,
      startDate: trips.startDate,
      endDate: trips.endDate,
      destinationName: trips.destinationName,
      coverImageUrl: trips.coverImageUrl,
      coverImageData: trips.coverImageData,
    })
    .from(trips)
    .orderBy(desc(trips.createdAt)); // 新创建的排前面

  return <HomeTrips trips={rows} />;
}
