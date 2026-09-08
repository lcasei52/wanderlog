"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CollapsibleListProps {
  title: string;
  count?: number;
  onDelete: () => void;
  onTitleChange: (newTitle: string) => void;
}

export default function CollapsibleList({
  title,
  count,
  onDelete,
  onTitleChange,
}: CollapsibleListProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [listTitle, setListTitle] = useState(title);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    onTitleChange(listTitle);
  };

  return (
    <div className="border-b last:border-b-0">
      <div className="flex items-center gap-2 py-5 px-6">
        {/* 展开/收起箭头 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-700 hover:text-gray-900 transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </button>

        {/* 标题 - 可编辑 */}
        {isEditingTitle ? (
          <Input
            value={listTitle}
            onChange={(e) => setListTitle(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleTitleSubmit();
              } else if (e.key === "Escape") {
                setIsEditingTitle(false);
                setListTitle(title);
              }
            }}
            className="flex-1 h-auto text-base font-semibold border-0 border-b-2 border-blue-500 rounded-none px-0 py-0 focus-visible:ring-0"
            autoFocus
          />
        ) : (
          <h4
            className="flex-1 text-base font-semibold text-gray-900 cursor-pointer hover:text-gray-700 transition-colors"
            onClick={() => setIsEditingTitle(true)}
          >
            {listTitle}
          </h4>
        )}

        {/* 计数 */}
        {count !== undefined && count > 0 && (
          <span className="text-sm text-gray-500">{count} 个地点</span>
        )}

        {/* 更多选项菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-gray-400 hover:text-gray-600 transition-colors">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={onDelete}
            >
              删除列表
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 展开的内容 */}
      {isExpanded && (
        <div className="pb-5 px-6 pl-14 text-sm text-gray-500">
          暂无内容
        </div>
      )}
    </div>
  );
}
