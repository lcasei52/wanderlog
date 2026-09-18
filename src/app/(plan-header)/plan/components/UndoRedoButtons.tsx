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
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
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

  /*
   * 文案在手机上藏起来，只留那个回转箭头（顶栏一共就 375px，左边还有返回/地图、
   * 右边还有分享那些，两个带字的按钮太占地方）。lg 以上照旧带字 —— 那边地方宽裕，
   * 而且"复原"和"撤销"这两个箭头长得太像，光看图标不好认。
   *
   * ★ 藏了字就必须补 aria-label：display:none 的文本**不在**无障碍树里，
   * 不补的话这两个按钮在手机上没有可访问名称（读屏只能念个"按钮"）。
   */
  const buttons = (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        aria-label="撤销"
        title="撤销"
        className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
        disabled={!canUndo}
        onClick={undo}
      >
        <RotateCcw className="h-4 w-4" strokeWidth={3} />
        <span className="hidden lg:inline font-semibold">撤销</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label="复原"
        title="复原"
        className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
        disabled={!canRedo}
        onClick={redo}
      >
        <RotateCw className="h-4 w-4" strokeWidth={3} />
        <span className="hidden lg:inline font-semibold">复原</span>
      </Button>
    </div>
  );

  if (!slot) return null;
  return createPortal(buttons, slot);
}
