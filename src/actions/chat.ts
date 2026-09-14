"use server";

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { chatMessages, type ChatMessage } from "@/db/schema";

/**
 * 读该行程的全部对话（按时间升序）。
 *
 * 故意**不**在 [tripId]/page.tsx 的首屏里查：AI 面板是点开才用的，
 * 首屏每多一次查询就多一趟到 Neon 的往返（见 db/client.ts），那页已经查了七八次。
 * 由面板打开时从客户端调这里，慢也慢在用户已经点开之后。
 */
export async function listChatMessages(tripId: string): Promise<ChatMessage[]> {
  const db = getDb();

  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.tripId, tripId))
    .orderBy(asc(chatMessages.createdAt));
}

/**
 * 追加一条消息。
 * 不 revalidatePath：对话是纯客户端交互，重刷整页会把上面的行程查询全跑一遍。
 * 调用方是 fire-and-forget（见 AiAssistant 的 persist），写入慢也不挡回复。
 */
export async function appendChatMessage(
  tripId: string,
  role: "user" | "assistant",
  content: string,
  model: string | null,
): Promise<{ id: string }> {
  const db = getDb();

  const [row] = await db
    .insert(chatMessages)
    .values({ tripId, role, content, model })
    .returning({ id: chatMessages.id });

  return { id: row.id };
}

/** 清空该行程的对话 */
export async function clearChatMessages(tripId: string): Promise<void> {
  const db = getDb();

  await db.delete(chatMessages).where(eq(chatMessages.tripId, tripId));

  // 不 revalidatePath
}
