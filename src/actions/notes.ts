"use server";

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notes } from "@/db/schema";

/**
 * 创建笔记（不 revalidate，由前端乐观更新）
 */
export async function createNote(
  tripId: string,
  content: string,
): Promise<{ id: string }> {
  const db = getDb();

  // 获取当前最大 position
  const existing = await db
    .select({ position: notes.position })
    .from(notes)
    .where(eq(notes.tripId, tripId))
    .orderBy(asc(notes.position));

  const maxPosition =
    existing.length > 0 ? Math.max(...existing.map((n) => n.position)) : -1;

  const [newNote] = await db
    .insert(notes)
    .values({
      tripId,
      content,
      position: maxPosition + 1,
    })
    .returning({ id: notes.id });

  // 不 revalidatePath：notes 是纯客户端交互，重刷整页太慢
  return { id: newNote.id };
}

/**
 * 更新笔记内容（不 revalidate，由前端乐观更新）
 */
export async function updateNoteContent(
  noteId: string,
  content: string,
): Promise<void> {
  const db = getDb();

  await db
    .update(notes)
    .set({ content })
    .where(eq(notes.id, noteId));

  // 不 revalidatePath：刷新整页太慢，前端已经更新了本地状态
}

/**
 * 删除笔记（不 revalidate）
 */
export async function deleteNote(noteId: string): Promise<void> {
  const db = getDb();

  await db
    .delete(notes)
    .where(eq(notes.id, noteId));

  // 不 revalidatePath
}

/**
 * 批量更新笔记位置（拖拽排序，不 revalidate）
 */
export async function reorderNotes(
  tripId: string,
  noteIds: string[],
): Promise<void> {
  const db = getDb();

  // neon-http 没有事务，逐个更新
  await Promise.all(
    noteIds.map((id, index) =>
      db.update(notes).set({ position: index }).where(eq(notes.id, id)),
    ),
  );

  // 不 revalidatePath
}
