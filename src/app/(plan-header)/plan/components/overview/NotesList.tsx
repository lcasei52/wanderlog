"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import ListShell from "./ListShell";

/**
 * 概览区的 Notes 列表。
 * 目前仍是本地草稿（未入库），延续旧行为：展开一块可写的便签区。
 */
export default function NotesList() {
  const [expanded, setExpanded] = useState(true);

  return (
    <ListShell
      anchorId="list-notes"
      title="Notes"
      expanded={expanded}
      onExpandedChange={setExpanded}
    >
      <Textarea
        placeholder="在此处撰写或粘贴任何内容：如何出行，提示和技巧"
        className="min-h-[120px] resize-none border-gray-200 focus-visible:border-orange-300"
      />
    </ListShell>
  );
}
