"use client";

import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePlaces } from "@/context/places-context";
import { LIST_COLORS } from "@/lib/colors";
import type { PlaceContainer } from "@/types/place";

interface ContainerColorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 要换色的容器：概览里某个地点列表，或行程里某一天 */
  container: PlaceContainer;
}

/**
 * 「更换颜色」的调色盘：换掉一个容器（地点列表 / 某一天）的主色。
 *
 * 这一色管着这一容器里**所有** PlaceCard 左上那个图钉，也管着地图 marker、
 * 那些路线、图层选择器里的小圆点和详情卡「出现在哪些图层」里的点 ——
 * 它们本来就都从 context 的 itemColor / listColor / dayColor 取，一起换。
 *
 * 放在 plan/components/ 这一层（不是 overview/ 也不是 itinerary/）：两个子目录都要用，
 * 先例是同样被两边 ../ 引用的 PlaceCard / PlaceGap / PlaceKindBadge。
 *
 * ★ 当前颜色由**自己**从 context 取，不让调用方透传 —— 调用方只要能说清"给谁换"
 *   就够了（一个 container），多传一份颜色就多一个会跟源头不同步的副本。
 *
 * 点一个色块 = 立刻换 + 关弹窗，没有「确定」按钮：换色是**乐观**的（见
 * places-context 的 setContainerColor），点了当场就变，还让人再按一次确定很多余。
 */
export default function ContainerColorDialog({
  open,
  onOpenChange,
  container,
}: ContainerColorDialogProps) {
  const { listColor, dayColor, setContainerColor } = usePlaces();

  const current =
    container.kind === "list"
      ? listColor(container.listId)
      : dayColor(container.dayDate);

  const apply = (color: string | null) => {
    setContainerColor(container, color);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>更换颜色</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500">
          这里所有地点卡的图钉、地图上的标记和路线都会跟着换。
        </p>

        {/* 12 个色块，跟 lib/colors 的 LIST_COLORS 同源 —— 默认色就是从这一组里挑的，
            用户换也只能换到这一组里，所以"当前色"一定能在这里找到对应的那一块 */}
        <div className="grid grid-cols-6 gap-3 py-1">
          {LIST_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => apply(color)}
              aria-label={`换成 ${color}`}
              title={color}
              /*
                ring-offset-2 是描边跟色块之间留的那圈白，不写的话选中态贴着色块、
                在深色上几乎看不出来。当前色再叠个白色对勾（不是只靠描边）——
                描边在小色块上不够显眼。
              */
              className={`h-9 w-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                color === current ? "ring-2 ring-gray-400 ring-offset-2" : ""
              }`}
              style={{ backgroundColor: color }}
            >
              {color === current && <Check className="h-4 w-4 text-white" />}
            </button>
          ))}
        </div>

        {/*
          「恢复默认」= 把这个容器的记录**删掉**，回到 getColorByListId 哈希出来的那一色
          （跟这个列表/这一天从没被换过时一模一样）。
          没换过的时候再点它什么也不会发生 —— setContainerColor 认得出这种情况，
          既不会往库里写，也不会往撤销栈里塞一条看不出变化的记录。
        */}
        <div className="flex justify-end border-t pt-3">
          <button
            type="button"
            onClick={() => apply(null)}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            恢复默认
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
