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
    /*
      pl-16 是给桌面侧栏那颗跨界 AI 胶囊让位的（它压在 header 左侧那条带上），
      lg 以下没有那个侧栏、也没有那颗胶囊，退回普通内边距。
      不这么写 375px 上必溢出：左右内边距就 96px，左边 logo+分隔线+撤销重做 ~120px，
      右边 计划/游记 + 分享 + 更多 ~246px，加起来 460px > 375px，会顶出横向滚动条。
    */
    <header className="flex h-16 items-center justify-between border-b bg-white pl-4 pr-3 lg:pl-16 lg:pr-8">
      {/* 左侧 */}
      <div className="flex items-center gap-2 lg:gap-4">
        <Link
          href="/home"
          className="flex items-center gap-2 text-orange-500 hover:text-orange-600 transition-colors"
        >
          <Map className="h-12 w-12" />
        </Link>
        <div className="h-6 w-px bg-gray-300" />
        <div id="undo-redo-slot" />
      </div>

      {/* 右侧 */}
      <div className="flex items-center gap-2 lg:gap-3">
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
          {/*
            hidden sm:flex —— 「计划/游记」这个切换本来就是个半成品（journal 还是 disabled），
            值不了手机上那 120px。sm(640) 以上本来也不缺这点宽度，保持原样。
          */}
          <SelectTrigger className="hidden rounded-full pl-3.5 font-black text-gray-700 sm:flex">
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
