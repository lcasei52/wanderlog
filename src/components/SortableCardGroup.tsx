"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SortableCardGroupProps {
  /** 当前顺序的 id 列表（与 renderItem 的渲染顺序一一对应） */
  ids: string[];
  /** 拖放结束后回传新顺序；父组件负责乐观更新本地态 + 落库 */
  onReorder: (orderedIds: string[]) => void;
  /** 提供则在卡片右侧外面显示垃圾桶 */
  onDelete?: (id: string) => void;
  /**
   * 该卡能不能拖（默认都能）。返回 false 的卡不显示拖动柄、拖不走自己，
   * 但仍然可以被别的卡拖到它前/后（位置本身有意义的卡，如每天首尾的酒店）。
   */
  canDrag?: (id: string) => boolean;
  /**
   * 画两张卡之间的"间隔"（从第 2 张起，每张卡上方一条；传 null 就是纯空隙）。
   * beforeId/index = 这条间隔下面那张卡；dragging = 正在拖别的卡 ——
   * 间隔里的交互（比如列表的 + 号）应当在这时让位给橙色插入线。
   * 内容放进一条 `min-h-2` 的容器里（不渲染内容时就是这 8px 空隙）：
   * 返回在流里的内容会按它的高度撑开间隔（如列表/日程里那条 24px 的可交互间隔），
   * 返回绝对定位的元素则维持 8px 不变。
   */
  renderGap?: (beforeId: string, index: number, dragging: boolean) => ReactNode;
  /** 画一张卡的内容（不要自己画拖拽手柄/垃圾桶，这层统一提供） */
  renderItem: (id: string) => ReactNode;
  /** 外层容器的额外 class */
  className?: string;
  /** 垃圾桶的提示文案 */
  deleteTitle?: string;
}

/**
 * 「卡片容器」：给任意一列卡片统一加上 容器内拖动排序 + hover 时才出现的操作按钮。
 *
 * 交互：鼠标移到卡片上 → 卡片左边外面浮现拖动柄、右边外面浮现垃圾桶；
 * 按住拖动柄在容器内上下移动，越过某张卡的中线即插到它前/后（带一条橙色插入线）。
 *
 * 实现要点：
 * - 用原生 HTML5 拖放（项目没有拖拽库）：只有拖动柄带 draggable，
 *   拖拽事件从柄冒泡到外层 wrapper，由 wrapper 统一处理 —— 这样卡片内部
 *   的输入框/按钮照常可点，不会整张卡都变成拖拽热区。
 * - 拖动影像是整张卡（setDragImage 传 wrapper），而不是那个小按钮。
 * - 卡片间距是 wrapper 里一条真实的 `min-h-2` 间隔元素（不是 padding），
 *   这样间隔里可以放东西（列表的插入点、Day 的连接线），并且能被 hover / 撑高。
 * - 顺序只在本地算好回传，持久化交给调用方（各 context 的 reorder* 动作）。
 */
export default function SortableCardGroup({
  ids,
  onReorder,
  onDelete,
  canDrag,
  renderGap,
  renderItem,
  className,
  deleteTitle = "删除",
}: SortableCardGroupProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // 当前悬停在哪张卡上、插到它前面还是后面（决定插入线的位置）
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    after: boolean;
  } | null>(null);
  // 拖影需要拿到整张卡的 DOM 节点
  const itemRefs = useRef(new Map<string, HTMLDivElement | null>());

  const reset = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  // 拖动柄上的 dragstart 冒泡到这里（用 HTMLElement 泛型，卡片容器与按钮两种 target 都能接）
  const handleDragStart = (e: DragEvent<HTMLElement>, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    // 有的浏览器（Firefox）不设数据就不会启动拖拽
    e.dataTransfer.setData("text/plain", id);
    const el = itemRefs.current.get(id);
    if (el) e.dataTransfer.setDragImage(el, 24, 16);
  };

  const handleDragOver = (e: DragEvent<HTMLElement>, id: string) => {
    if (!draggingId || draggingId === id) return;
    e.preventDefault(); // 不 preventDefault 就不允许 drop
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDropTarget((prev) =>
      prev?.id === id && prev.after === after ? prev : { id, after },
    );
  };

  const handleDrop = (e: DragEvent<HTMLElement>, id: string) => {
    e.preventDefault();
    const movingId = draggingId;
    if (!movingId || movingId === id) return reset();

    const after = dropTarget?.id === id ? dropTarget.after : false;
    const next = ids.filter((x) => x !== movingId);
    next.splice(next.indexOf(id) + (after ? 1 : 0), 0, movingId);
    reset();

    if (next.join("|") !== ids.join("|")) onReorder(next);
  };

  return (
    <div className={className}>
      {ids.map((id, index) => (
        <div
          key={id}
          ref={(el) => {
            itemRefs.current.set(id, el);
          }}
          className={cn(
            "group/card relative",
            draggingId === id && "opacity-40",
          )}
          onDragOver={(e) => handleDragOver(e, id)}
          onDrop={(e) => handleDrop(e, id)}
        >
          {/* 与上一张卡之间的间隔（第一张卡上方不空出高度，组外层间距不变） */}
          {index > 0 && (
            <div className="relative min-h-2">
              {renderGap?.(id, index, draggingId !== null)}
            </div>
          )}

          {/* 卡片本体 + 浮在它外面左右两侧的操作按钮（都以卡片盒为定位参照） */}
          <div className="relative">
            {/* 插入位置提示线（-top-1 / -bottom-1 = 落在相邻两条间隔的中线上） */}
            {dropTarget?.id === id && (
              <span
                className={cn(
                  "pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-orange-400",
                  dropTarget.after ? "-bottom-1" : "-top-1",
                )}
              />
            )}

            {renderItem(id)}

            {/* 拖动柄：卡片左边外面，hover 卡片时浮现（canDrag 为 false 的卡不给柄） */}
            {(canDrag ? canDrag(id) : true) && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                draggable
                aria-label="拖动排序"
                title="按住拖动，在容器内调整顺序"
                className="absolute -left-6 top-1/2 -translate-y-1/2 cursor-grab text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 active:cursor-grabbing group-hover/card:opacity-100 focus-visible:opacity-100"
                onDragStart={(e) => handleDragStart(e, id)}
                onDragEnd={reset}
              >
                <GripVertical className="size-3.5" />
              </Button>
            )}

            {/* 垃圾桶：卡片右边外面，hover 卡片时浮现 */}
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={deleteTitle}
                title={deleteTitle}
                className="absolute -right-6 top-1/2 -translate-y-1/2 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover/card:opacity-100 focus-visible:opacity-100"
                onClick={() => onDelete(id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
