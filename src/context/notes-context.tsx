"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Note } from "@/db/schema";
import { useHistory, useRegisterSnapshot } from "@/context/history-context";
import { createNote, updateNoteContent } from "@/actions/notes";

interface NotesContextValue {
  tripId: string;
  /** 已提交的笔记，按 position 升序 */
  notes: Note[];
  /**
   * 提交整段内容（失焦时调）：一条笔记都没有就新建，有就更新第一条。
   * 空内容且没有笔记时不写库、也不记快照。
   */
  saveContent: (content: string) => Promise<void>;
}

const NotesContext = createContext<NotesContextValue | null>(null);

/**
 * 笔记的 provider。
 *
 * 以前 NotesList 把内容存在自己的 useState 里直接调 action，撤销栈够不到它 ——
 * 收进 context 之后笔记才能进快照（见 history-context 的撤销契约）。
 * 挂载顺序不挑（笔记谁也不依赖），在 TripHistoryProvider 里面就行。
 */
export function NotesProvider({
  tripId,
  notes: seedNotes,
  children,
}: {
  tripId: string;
  notes: Note[];
  children: ReactNode;
}) {
  const [notes, setNotes] = useState<Note[]>(seedNotes);

  const { push, restoreNonce } = useHistory();
  useRegisterSnapshot("notes", () => notes, setNotes);

  /*
   * 给下面几个回调用的"最新值"，免得把它们写进依赖数组里（那会让 saveContent
   * 每次保存都换一次身份，NotesList 里的 effect 跟着瞎跑）。
   */
  const notesRef = useRef(notes);
  const restoreNonceRef = useRef(restoreNonce);
  useLayoutEffect(() => {
    notesRef.current = notes;
    restoreNonceRef.current = restoreNonce;
  });

  /**
   * 保存整段内容。
   *
   * ★ 这里有一处**新引入**的竞态：点撤销按钮时 textarea 会先失焦，于是"失焦保存"
   * 和"撤销"挤在一起 —— 保存这一趟还没回来，撤销已经把本地状态换成了快照里那份。
   * 挡法就是开头记下的 restoreNonce：回来时若它变了，说明这期间恢复过，那次保存的
   * 效果已经被撤销接管（撤销排队的那次整表同步会把库也改成快照里的样子），
   * 这时**不要**再用服务端结果覆盖本地。见 history-context 顶部规矩四。
   */
  const saveContent = useCallback(
    async (content: string) => {
      const isCreate = notesRef.current.length === 0;
      const trimmed = content.trim();
      // 空内容又没有笔记：不必建一条空笔记，更不能白记一份快照
      // （push 只跟栈顶比，记下一份和当前状态一模一样的快照 = 按一下撤销什么也不动）
      if (isCreate && !trimmed) return;

      const nonceAtStart = restoreNonceRef.current;
      // push 必须在第一个 await 之前：它取的是"上一次已提交渲染"的笔记
      push();
      try {
        if (isCreate) {
          const row = await createNote(tripId, trimmed);
          if (restoreNonceRef.current !== nonceAtStart) return;
          setNotes((prev) => (prev.length === 0 ? [row] : prev));
        } else {
          const first = notesRef.current[0];
          await updateNoteContent(first.id, content);
          if (restoreNonceRef.current !== nonceAtStart) return;
          setNotes((prev) =>
            prev.map((n) => (n.id === first.id ? { ...n, content } : n)),
          );
        }
      } catch (err) {
        console.error("保存笔记失败:", err);
      }
    },
    [tripId, push],
  );

  const value = useMemo<NotesContextValue>(
    () => ({ tripId, notes, saveContent }),
    [tripId, notes, saveContent],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) {
    throw new Error("useNotes 必须在 <NotesProvider> 内使用");
  }
  return ctx;
}
