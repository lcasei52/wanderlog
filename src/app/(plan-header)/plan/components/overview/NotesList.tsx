"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { Note } from "@/db/schema";
import { createNote, updateNoteContent } from "@/actions/notes";
import ListShell from "./ListShell";

interface NotesListProps {
  tripId: string;
  notes: Note[];
}

/**
 * 概览区的 Notes 列表。
 * 单个 textarea，失焦自动保存。
 */
export default function NotesList({ tripId, notes }: NotesListProps) {
  const [expanded, setExpanded] = useState(true);
  const [content, setContent] = useState(notes[0]?.content ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const handleBlur = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      if (notes.length === 0) {
        // 还没有笔记 → 创建第一条
        if (content.trim()) {
          await createNote(tripId, content.trim());
        }
      } else {
        // 已有笔记 → 更新第一条
        await updateNoteContent(notes[0].id, content);
      }
    } catch (err) {
      console.error("保存笔记失败:", err);
    } finally {
      setIsSaving(false);
    }
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
        {isSaving && (
          <p className="text-xs text-gray-400 mt-2">保存中...</p>
        )}
      </div>
    </ListShell>
  );
}
