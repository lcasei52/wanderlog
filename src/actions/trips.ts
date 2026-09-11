"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { trips } from "@/db/schema";
import { ensureTripDays } from "@/db/trip-days";
import { ensureTripPlaceLists } from "@/db/trip-place-lists";

// 创建行程的入参（与创建页表单字段对应，日期已转成 "YYYY-MM-DD" 字符串）
const createTripSchema = z.object({
  name: z.string().min(1, "缺少行程名称"),
  destination: z
    .object({
      name: z.string(),
      location: z.object({ lng: z.number(), lat: z.number() }),
      type: z.enum(["city", "province", "country"]),
    })
    .nullable(), // 用户可能只打字没选具体目的地
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  privacy: z.enum(["public", "friends", "private"]),
  inviteEmail: z.string().optional().or(z.literal("")),
});

export type CreateTripInput = z.infer<typeof createTripSchema>;

/**
 * 创建行程：插入 trips 表，返回新行程 id，供前端跳转到 /plan/{id}。
 * 如果有 destination，自动用目的地名搜 Unsplash 设置封面图。
 */
export async function createTrip(raw: unknown): Promise<{ id: string }> {
  const data = createTripSchema.parse(raw);

  const id = randomUUID();

  // 如果有目的地，搜索 Unsplash 获取第一张图作为封面
  let coverImageUrl: string | null = null;
  if (data.destination?.name) {
    try {
      const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
      if (unsplashKey) {
        const response = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(data.destination.name)}&per_page=1&orientation=landscape`,
          {
            headers: {
              Authorization: `Client-ID ${unsplashKey}`,
            },
          }
        );
        if (response.ok) {
          const result = await response.json();
          if (result.results?.[0]?.urls?.regular) {
            coverImageUrl = result.results[0].urls.regular;
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch Unsplash cover image:", error);
      // 静默失败，不影响行程创建
    }
  }

  await getDb().insert(trips).values({
    id,
    name: data.name,
    destinationName: data.destination?.name ?? null,
    destinationLng: data.destination?.location.lng ?? null,
    destinationLat: data.destination?.location.lat ?? null,
    destinationType: data.destination?.type ?? null,
    startDate: data.startDate,
    endDate: data.endDate,
    privacy: data.privacy,
    invitedEmails: data.inviteEmail?.trim() ? [data.inviteEmail.trim()] : [],
    coverImageUrl,
    coverImageData: null,
  });

  // 补全默认结构：按日期生成 days；预建默认地点列表（Notes/Flights/Hotels 是内容表直接归属，不预建行）
  await ensureTripDays(id, data.startDate, data.endDate);
  await ensureTripPlaceLists(id);

  return { id };
}

/**
 * 记住地图图层里哪些被关掉了（键见 types/place 的 listLayerKey / dayLayerKey）。
 * 纯视图偏好，一个 jsonb 列存下，不另建表。
 *
 * 刻意不 revalidatePath：勾一个图层就重刷一遍服务端组件不值当，而且
 * 这个值只在首屏读一次（详情页的初值），写完之后当前这一屏本来就是对的。
 */
export async function saveHiddenLayers(
  tripId: string,
  hidden: string[],
): Promise<void> {
  await getDb()
    .update(trips)
    .set({ hiddenLayers: hidden })
    .where(eq(trips.id, tripId));
}

/**
 * 删除行程：按 id 删除 trips 一行。
 * 子表（lists/days/places/plan_items/flights/hotels/notes）都有
 * onDelete: cascade，会由数据库一并清掉。
 * 找不到该 id 时静默返回成功（重复点击/已删场景幂等）。
 */
export async function deleteTrip(id: string): Promise<{ ok: true }> {
  await getDb().delete(trips).where(eq(trips.id, id));
  return { ok: true };
}
