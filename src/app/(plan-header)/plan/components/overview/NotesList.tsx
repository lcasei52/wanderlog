"use client";

import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useNotes } from "@/context/notes-context";
import ListShell from "./ListShell";

/**
 * 概览区的 Notes 列表。单个 textarea，失焦自动保存。
 *
 * 内容存在 NotesProvider 里（撤销栈要够得到它），组件只攥着一份**草稿**。
 * 草稿的写法照抄 PlaceCard 那一套，两个 ref 各管一件事：
 *  - `focusedRef`：正在输入时不要被外部值（撤销还原、别处的保存）打断；
 *  - `lastSavedRef`：内容没变就不提交 —— 每次失焦都写一遍的话，按新规矩每次写
 *    都是一条历史记录，撤销按钮会堆出一串"什么都没变"的步骤。
 */
export default function NotesList() {
  const { notes, saveContent } = useNotes();

  const [expanded, setExpanded] = useState(true);
  const [content, setContent] = useState(notes[0]?.content ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const focusedRef = useRef(false);
  // 始终是最新草稿的 ref（失焦那一刻也能拿到输入中的内容）
  const contentRef = useRef(content);
  contentRef.current = content;
  // 最近一次已提交的内容，避免重复提交
  const lastSavedRef = useRef(notes[0]?.content ?? "");

  // 源头那行变了（撤销还原、别处保存）就同步回草稿；正在输入时不打断
  useEffect(() => {
    if (focusedRef.current) return;
    const next = notes[0]?.content ?? "";
    setContent(next);
    lastSavedRef.current = next;
  }, [notes]);

  const handleBlur = () => {
    focusedRef.current = false;
    const next = contentRef.current;
    if (next === lastSavedRef.current) return;
    lastSavedRef.current = next;
    setIsSaving(true);
    void saveContent(next).finally(() => setIsSaving(false));
  };

  return (
    <ListShell
      anchorId="list-notes"
      title="Notes"
      expanded={expanded}
      onExpandedChange={setExpanded}
    >
      <div className="p-4">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={handleBlur}
          placeholder="在此处撰写或粘贴任何内容：如何出行，提示和技巧"
          className="min-h-[3.5rem] resize-none border-gray-200 focus-visible:border-orange-300 overflow-hidden"
          rows={2}
          style={{
            height: "auto",
            minHeight: "3.5rem",
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.max(56, target.scrollHeight) + "px";
          }}
        />
        {isSaving && <p className="text-xs text-gray-400 mt-2">保存中...</p>}
      </div>
    </ListShell>
  );
}
