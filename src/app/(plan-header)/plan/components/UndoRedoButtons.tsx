"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHistory } from "@/context/history-context";

export default function UndoRedoButtons() {
  // 撤销栈现在在 TripHistoryProvider 里（所有功能 provider 的外面），不再挂在 places 上
  const { undo, redo, canUndo, canRedo } = useHistory();
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("undo-redo-slot"));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  const buttons = (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
        disabled={!canUndo}
        onClick={undo}
      >
        <RotateCcw className="h-4 w-4" />
        <span>撤销</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
        disabled={!canRedo}
        onClick={redo}
      >
        <RotateCw className="h-4 w-4" />
        <span>复原</span>
      </Button>
    </div>
  );

  if (!slot) return null;
  return createPortal(buttons, slot);
}
