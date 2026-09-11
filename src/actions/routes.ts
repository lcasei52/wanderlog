"use server";

import { getDb } from "@/db/client";
import { routePlans } from "@/db/schema";
import type { RouteMode, RoutePlan } from "@/lib/place-route";

/**
 * 把一次路线查询的结果写进 route_plans（缓存）。
 *
 * plan 为 null = 高德明确说没有方案（跨城公交那种），也存 —— 负缓存能省掉
 * 每次重开行程都去问一遍同样没结果的问题。**查询失败/超时不要调这里**
 * （调用方按 requestRoutePlan 的 ok 判断），否则会把一次抖动记成 7 天的"无方案"。
 *
 * 刻意不 revalidatePath：route_plans 只在首屏读一次，写完不需要让服务端组件重渲染 ——
 * 否则每查出一条路线就刷一遍整页，30 个间隔就是 30 次全页重算。
 */
export async function saveRoutePlan(
  tripId: string,
  routeKey: string,
  mode: RouteMode,
  plan: RoutePlan | null,
): Promise<void> {
  const db = getDb();
  // neon-http 没有事务，但这就是一条语句，主键 (trip_id, route_key) 保证不会写重
  const values = {
    tripId,
    routeKey,
    mode,
    distance: plan ? plan.distance : null,
    duration: plan ? plan.time : null,
    path: plan ? plan.path : null,
    fetchedAt: new Date(),
  };
  await db
    .insert(routePlans)
    .values(values)
    .onConflictDoUpdate({
      target: [routePlans.tripId, routePlans.routeKey],
      set: {
        mode: values.mode,
        distance: values.distance,
        duration: values.duration,
        path: values.path,
        fetchedAt: values.fetchedAt,
      },
    });
}
