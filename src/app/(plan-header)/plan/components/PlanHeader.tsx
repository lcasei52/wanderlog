"use client";

import Link from "next/link";
import { Map } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ShareButton from "./ShareButton";
import MoreOptionsMenu from "./MoreOptionsMenu";
import { useState } from "react";

export default function PlanHeader() {
  const [viewMode, setViewMode] = useState<"plan" | "journal">("plan");

  return (
    <header className="h-16 border-b flex items-center justify-between px-4 bg-white">
      {/* 左侧 */}
      <div className="flex items-center gap-4">
        <Link
          href="/home"
          className="flex items-center gap-2 text-orange-500 hover:text-orange-600 transition-colors"
        >
          <Map className="h-6 w-6" />
        </Link>
        <div className="h-6 w-px bg-gray-300" />
        <div id="undo-redo-slot" />
      </div>

      {/* 右侧 */}
      <div className="flex items-center gap-3">
        {/* 计划/游记切换 */}
        <Select
          value={viewMode}
          onValueChange={(value: "plan" | "journal") => setViewMode(value)}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plan">计划</SelectItem>
            <SelectItem value="journal">游记</SelectItem>
          </SelectContent>
        </Select>

        <ShareButton />
        <MoreOptionsMenu />
      </div>
    </header>
  );
}
