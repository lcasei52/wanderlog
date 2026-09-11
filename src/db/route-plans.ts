import { and, eq, gte } from "drizzle-orm";
import { getDb } from "./client";
import { routePlans } from "./schema";
import {
  ROUTE_CACHE_TTL_DAYS,
  isRouteMode,
  type CachedRoutePlan,
} from "@/lib/place-route";

/**
 * 读某行程已入库的路线缓存（route_plans），供详情页首屏灌进客户端。
 *
 * 只在服务端调；写入走 actions/routes.ts 的 saveRoutePlan（那是 server action）。
 * 过期的行这里直接不返回（当没查过，前端会重查并覆盖），行本身留着不动 ——
 * 为一个缓存表在每次页面加载时多发一条 DELETE 不划算。
 */
export async function loadRoutePlans(
  tripId: string,
): Promise<CachedRoutePlan[]> {
  const db = getDb();
  const cutoff = new Date(
    Date.now() - ROUTE_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows = await db
    .select()
    .from(routePlans)
    .where(
      and(eq(routePlans.tripId, tripId), gte(routePlans.fetchedAt, cutoff)),
    );

  const out: CachedRoutePlan[] = [];
  for (const row of rows) {
    // mode 是 text 列，认不出来（脏数据 / 以后改了枚举）就当没缓存，让前端重查
    if (!isRouteMode(row.mode)) continue;
    // 没有 distance/duration = 这条是负缓存
    if (row.distance == null || row.duration == null) {
      out.push({ routeKey: row.routeKey, plan: null });
      continue;
    }
    out.push({
      routeKey: row.routeKey,
      plan: {
        mode: row.mode,
        distance: row.distance,
        time: row.duration,
        path: row.path ?? [], // 有方案但几何没解析出来时是 []
      },
    });
  }
  return out;
}
