"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { trips } from "@/db/schema";
import { ensureTripDays } from "@/db/trip-days";

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
 * 创建行程：插入 trips 表，返回新行程 id，供前端跳转到 /plan/{id}
 */
export async function createTrip(raw: unknown): Promise<{ id: string }> {
  const data = createTripSchema.parse(raw);

  const id = randomUUID();

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
  });

  // 补全默认结构：按日期生成 days（Notes/Flights/Hotels 是内容表直接归属，不预建行）
  await ensureTripDays(id, data.startDate, data.endDate);

  return { id };
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
