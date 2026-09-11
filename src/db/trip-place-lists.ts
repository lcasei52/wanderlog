import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { lists } from "./schema";

/**
 * 给行程补全默认的地点列表 "Places to visit"（position 0）。
 * 幂等：该行程已有任意地点列表则不插入。
 * 其余自定义列表由用户「+ 新列表」创建（见 actions/places.ts）。
 */
export async function ensureTripPlaceLists(tripId: string): Promise<void> {
  const db = getDb();

  const existing = await db
    .select({ id: lists.id })
    .from(lists)
    .where(eq(lists.tripId, tripId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(lists).values({
      tripId,
      title: "Places to visit",
      position: 0,
    });
  }
}
