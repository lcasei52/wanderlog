"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PickableItem } from "@/lib/expense-helpers";
import PickableItemRow from "./PickableItemRow";

interface AllItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PickableItem[];
  selectedKey?: string | null;
  onSelect: (item: PickableItem) => void;
}

/**
 * 「所有行程项目」：带搜索框的全量列表，点一项即回填到添加费用表单。
 *
 * 行样式跟「选择项目」里那几行完全一致（共用 PickableItemRow），
 * 因为对用户来说这就是同一个列表的展开版。
 *
 * 搜索也匹配 origin：重名项目的区分全在那行小字上，用户想找「Day 1 那个武汉大学」
 * 时会直接打 "Day 1"。
 */
export default function AllItemsDialog({
  open,
  onOpenChange,
  items,
  selectedKey,
  onSelect,
}: AllItemsDialogProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.category.includes(q) ||
        item.origin.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold text-gray-900">
            所有行程项目
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="搜索地点、航班、住宿"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="max-h-[50vh] space-y-0.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              {items.length === 0 ? "行程里还没有项目" : "没有匹配的项目"}
            </p>
          ) : (
            filtered.map((item) => (
              <PickableItemRow
                key={item.key}
                item={item}
                selected={item.key === selectedKey}
                onSelect={() => onSelect(item)}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
