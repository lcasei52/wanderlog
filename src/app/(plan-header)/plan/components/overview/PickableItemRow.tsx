"use client";

import { itemTypeIcon, type PickableItem } from "@/lib/expense-helpers";
import { cn } from "@/lib/utils";

interface PickableItemRowProps {
  item: PickableItem;
  selected?: boolean;
  onSelect: () => void;
}

/**
 * 「选择项目」和「所有行程项目」里的一行：浅灰圆底的**类型**图标 + 名字，
 * 最右边跟上「来自哪里」。
 *
 * 图标按项目类型走（航班/地点/住宿三种），不是按费用类别 —— 理由见
 * expense-helpers 的 itemTypeIcon。
 *
 * 单独抽成一个文件是因为两个弹窗里的这一行完全一样（本来各写了一份），
 * 各自进化迟早会长歪。
 */
export default function PickableItemRow({
  item,
  selected,
  onSelect,
}: PickableItemRowProps) {
  const Icon = itemTypeIcon(item.linkedItemType);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50",
        selected && "bg-orange-50 hover:bg-orange-50",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
        <Icon className="size-5 text-gray-700" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
        {item.name}
      </span>
      {/*
        「来自哪里」。shrink-0 是必须的：否则名字长的时候这行小字会被挤扁，
        而它恰恰是用来区分两个同名项目的，压没了这个列表就没意义了。
      */}
      <span className="shrink-0 text-xs text-gray-400">{item.origin}</span>
    </button>
  );
}
