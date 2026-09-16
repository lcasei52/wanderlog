"use server";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notes, type Note } from "@/db/schema";

/*
 * ⚠️ 这一组 action 由 NotesProvider（src/context/notes-context.tsx）调用，组件
 * 不该直接碰它们 —— 状态收在 context 里，撤销栈才够得到笔记（见 history-context
 * 顶部那段"撤销契约"）。新加笔记动作时记得同步登记进快照。
 */

/**
 * 创建笔记（不 revalidate，由前端乐观更新）
 *
 * 返回**整行**：调用方是 NotesProvider，要把这一行存进本地状态和撤销快照里，
 * 只给个 id 的话它没法拼出完整的一行。
 */
export async function createNote(
  tripId: string,
  content: string,
): Promise<Note> {
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
    .returning();

  // 不 revalidatePath：notes 是纯客户端交互，重刷整页太慢
  return newNote;
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

/* ============================================================
 * Undo / Redo：整体快照同步（只同步这一张表）
 * ============================================================ */

/**
 * 把 trip 的 notes 整体替换成快照里的状态。撤销栈调用，别的地方不用碰。
 *
 * 和另外几个 sync* 并发是安全的：notes 除 trip_id 外一张外键都不挂，谁先谁后都行。
 *
 * ⚠️ 有意**不**调 revalidatePath，和上面那三个 action 保持一致：撤销时界面已经在
 * 本地改好了，重刷整页只会慢一下。这份快照同步属于同一类 —— "库里改了、界面已经
 * 是新的"，不需要再让服务端渲染追一次。
 */
export async function syncNotesSnapshot(
  tripId: string,
  snapshot: Note[],
): Promise<void> {
  const db = getDb();

  const snapIds = snapshot.map((n) => n.id);
  const existing = await db
    .select({ id: notes.id })
    .from(notes)
    .where(eq(notes.tripId, tripId));
  const toDelete = existing.filter((n) => !snapIds.includes(n.id)).map((n) => n.id);
  if (toDelete.length > 0) {
    await db.delete(notes).where(inArray(notes.id, toDelete));
  }

  // 整批一条语句（多行 VALUES + 冲突时用 excluded 覆盖）；createdAt 有意不写：
  // 新插的走默认值，已存在的保持原来那一刻
  if (snapshot.length > 0) {
    await db
      .insert(notes)
      .values(
        snapshot.map((n) => ({
          id: n.id,
          tripId,
          content: n.content,
          position: n.position,
        })),
      )
      .onConflictDoUpdate({
        target: notes.id,
        set: {
          content: sql`excluded.content`,
          position: sql`excluded.position`,
        },
      });
  }
}
