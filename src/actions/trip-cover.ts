"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { trips } from "@/db/schema";

/**
 * 更新行程封面图片
 * @param tripId 行程 ID
 * @param cover 封面数据：url（网络图）或 data（本地图 base64）
 */
export async function updateTripCover(
  tripId: string,
  cover: { url?: string; data?: string }
): Promise<{ ok: true }> {
  await getDb()
    .update(trips)
    .set({
      coverImageUrl: cover.url ?? null,
      coverImageData: cover.data ?? null,
    })
    .where(eq(trips.id, tripId));

  return { ok: true };
}
