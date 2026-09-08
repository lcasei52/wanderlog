import { eq } from "drizzle-orm";
import { parse, addDays, differenceInDays, format } from "date-fns";
import { getDb } from "./client";
import { days } from "./schema";

/**
 * 给行程补全默认的"天"结构：若还没有 days 且给了起止日期，
 * 则按日期生成每天的 day 行。幂等：已有 days 则跳过。
 *
 * 四个固定 section（Notes / Flights / Hotels / 地点列表）不再由
 * 模板预建——Notes/Flights/Hotels 是内容表直接归属 trip，有数据
 * 即有 section；地点列表由用户「+新列表」产生。
 */
export async function ensureTripDays(
  tripId: string,
  startDate?: string | null,
  endDate?: string | null,
): Promise<void> {
  const db = getDb();

  const existingDay = await db
    .select({ id: days.id })
    .from(days)
    .where(eq(days.tripId, tripId))
    .limit(1);

  if (existingDay.length === 0 && startDate && endDate) {
    const start = parse(startDate, "yyyy-MM-dd", new Date());
    const end = parse(endDate, "yyyy-MM-dd", new Date());
    if (end >= start) {
      const count = differenceInDays(end, start) + 1;
      await db.insert(days).values(
        Array.from({ length: count }, (_, i) => ({
          tripId,
          date: format(addDays(start, i), "yyyy-MM-dd"),
          position: i,
        })),
      );
    }
  }
}
