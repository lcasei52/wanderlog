"use client";

import Link from "next/link";
import { CalendarDays, Map } from "lucide-react";
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
    <header className="h-16 border-b flex items-center justify-between pl-16 pr-8 bg-white">
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
          {/*
            text-gray-700：SelectTrigger 自己的类里没有文字颜色（见 ui/select.tsx），
            不写就继承 body 的 text-foreground（接近纯黑）。写在这儿而不是给
            SelectValue 加类：值那个 span 继承触发器的颜色，加一层只是多一层搬运。
            左边那个图标也不写颜色，跟着一起是这个深灰 —— 它跟文字是一体的。

            右边那个下三角**不跟着变**：它自己固定 text-muted-foreground（浅灰），
            跟这里的深灰分开 —— 箭头是装饰，比文字浅一档才不抢。

            宽度不写：基类本来就是 w-fit，跟着内容撑开就够。
            原来写死 w-32（128px），两个字的内容只有它一半宽，看着空荡荡的。

            pl-3.5（14px）而不是基类的 pl-2.5（10px）：加了图标之后整个按钮宽了，
            左边多留这点，宽度正好跟右边的「分享」按钮齐 —— 两个都是 h-8 高，
            宽度再对齐才是并排的一对。

            rounded-full 盖掉基类的 rounded-lg：旁边「分享」是个橙色胶囊
            （它自己是 rounded-full，首页那颗「计划新行程」也是），这里跟着圆起来
            两个才像一组。h-8 加 rounded-full 就是半径 16px 的胶囊，正好一半。
          */}
          <SelectTrigger className="rounded-full pl-3.5 font-black text-gray-700">
            <CalendarDays className="size-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plan" className="font-bold">
              计划
            </SelectItem>
            <SelectItem disabled value="journal" className="font-bold">
              游记
            </SelectItem>
          </SelectContent>
        </Select>

        <ShareButton />
        <MoreOptionsMenu />
      </div>
    </header>
  );
}
