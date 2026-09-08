"use client";

import { MoreVertical, Settings, Download, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function MoreOptionsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <MoreVertical className="h-5 w-5 text-gray-600" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <span>设置</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          <span>导出</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex items-center gap-2 text-red-600">
          <Trash2 className="h-4 w-4" />
          <span>删除行程</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
