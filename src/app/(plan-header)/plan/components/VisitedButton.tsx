"use client";

import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 共享的「标记为已访问」点击反馈（PlaceCard 与 PlaceDetailCard 保持一致） */
export function visitedToggleFeedback(wasVisited: boolean): void {
  toast.success(wasVisited ? "已取消「已访问」标记" : "已标记为已访问");
}

interface VisitedButtonProps {
  visited: boolean;
  onToggle: () => void;
  /** md：PlaceDetailCard 大按钮；sm：PlaceCard 展开行里的紧凑按钮 */
  size?: "md" | "sm";
  className?: string;
}

/**
 * 与地图/行内共用行为一致的"已访问"切换按钮。
 * 状态由父级通过 onToggle 写入 place_items（visited 列）。
 */
export default function VisitedButton({
  visited,
  onToggle,
  size = "md",
  className,
}: VisitedButtonProps) {
  return (
    <Button
      variant={visited ? "default" : "outline"}
      size={size === "sm" ? "sm" : "default"}
      onClick={onToggle}
      className={cn(
        size === "sm" && "h-7 px-2 text-xs gap-1",
        visited
          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
          : "text-gray-600",
        className,
      )}
    >
      <Check className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {visited ? "已标记为已访问" : "标记为已访问"}
    </Button>
  );
}
