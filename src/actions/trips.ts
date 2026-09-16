"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { trips } from "@/db/schema";
import { ensureTripDays } from "@/db/trip-days";
import { ensureTripPlaceLists } from "@/db/trip-place-lists";
import { ensureTripSelfMember } from "@/db/trip-members";

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

  /*
   * 补全默认结构：按日期生成 days；预建默认地点列表；补上「我」那一行。
   * （Notes/Flights/Hotels 是内容表直接归属，不预建行。）
   *
   * 三件事各写各的表、互不依赖，所以并发发出 —— 本机到 Neon 一趟往返一两秒，
   * 串行是延迟相加、并发是取最大（db/client.ts 记着这笔账）。
   * 「我」那一行必须有：expenses.paid_by 是 notNull 外键指向 trip_members，
   * 没有成员就一笔费用都记不了。
   */
  await Promise.all([
    ensureTripDays(id, data.startDate, data.endDate),
    ensureTripPlaceLists(id),
    ensureTripSelfMember(id),
  ]);

  return { id };
}

/**
 * 记住地图图层里哪些被关掉了（键见 types/place 的 listLayerKey / dayLayerKey）。
 * 纯视图偏好，一个 jsonb 列存下，不另建表。
 *
 * 刻意不 revalidatePath：这个值只在首屏读一次（MapView 的初值），写完之后当前
 * 这一屏本来就是对的 —— 和地点/费用/航班/住宿/成员那几个 action 是同一条规矩，
 * 判据见下面 updateTripBudget 上方那段。
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
 * 设置/清除行程总预算。
 * budget 传 null 表示不设预算（进度条随之隐藏，只显示已花总额）。
 *
 * ★ 全项目唯一还调 revalidatePath 的写入。判据只有一条：**这份数据还有没有别的
 *   owner**。
 *
 * /plan/[tripId] 这一页上的数据分两类：
 *
 *   1. 客户端有完整副本的：地点、费用、航班、住宿、成员、笔记。它们各自的 context
 *      拿 page.tsx 的 props **只当一次初值**（useState(seeds)），之后列表、卡片、
 *      预算里的已花总额全由本地维护 —— 所以那些 action 一个都不该 revalidatePath。
 *      调了也没人消费那次的渲染结果，纯白跑一趟（这一页一次渲染要打 8 条查询，
 *      每条都是一趟到 Neon 的 HTTPS，一趟一两秒）。见 places/expenses/flights/
 *      hotels/members 各文件顶部那段。
 *
 *   2. 真从服务端 props 读、客户端没有副本的：行程名、封面、图层初值，以及**预算**。
 *      不重刷的话进度条不会动 —— 所以只剩这一个必须留着。
 *
 * ⚠️ 别再顺手加 router.refresh()：一个 action 只要调了 revalidatePath，重渲染后的
 * 页面就会搭在**这次 action 自己的响应**里回来，调用方再 refresh 一次是白跑一趟。
 * 两者留一个就够，这里留 action 里这个（换谁来调都不会拿到旧预算）。这条踩过一次，
 * 见 BudgetSettingsDialog 里那段。
 *
 * ⚠️ 反面提醒：判据 1 那批数据，以后**新写组件时别从 props 读**。读了就会看见过期
 * 的值，因为已经没人替它作废服务端那份渲染结果了 —— 读者应该是各自的 context。
 */
export async function updateTripBudget(
  tripId: string,
  budget: number | null,
  currency: string,
): Promise<void> {
  await getDb()
    .update(trips)
    .set({ budget, budgetCurrency: currency })
    .where(eq(trips.id, tripId));
  revalidatePath(`/plan/${tripId}`);
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
