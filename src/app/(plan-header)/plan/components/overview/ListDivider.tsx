"use client";

import { Plus } from "lucide-react";

interface ListDividerProps {
  /**
   * 传了就带上「在此处新增列表」的 +（点它 = 在这条线下面插一个新列表）；
   * 不传就是一条普通的分隔线。
   */
  onAdd?: () => void;
}

/**
 * 概览那一列里两个列表之间的分隔线（也是两个列表之间的那段间隙）。
 *
 * 高度就是间隙：这一层从前是 0（线贴着走），现在撑到 h-6 —— 两个列表之间多出来的
 * 24px 全在这儿，线仍旧画在正中间，只是两边各多了 12px 呼吸。想再松一点就改这个
 * 高度（唯一一处）。带 + 的和不带 + 的用同一个高度，整列的节奏才是匀的。
 *
 * 为什么不是 ListShell 的一部分、也不是 `divide-y` 画出来的：`divide-y` 只会在两个
 * **相邻的兄弟**之间画线，而这条线要能挂一个按钮上去（按钮得挂在一个有定位的父元素
 * 里，还得压在这条线所在的这一段上）。所以这条线由这个组件自己画，凡是挨着它的地方
 * 就不能再有 `divide-y` —— 两个边框叠在一起是 2px 的双线。
 *
 * + 的位置对着**这一列内容的左沿**（56px = pl-14，也就是 ListShell 内容区和
 * 行程里 DayCard 内容区的那个左沿）：卡片底部那行「+ 新列表」也落在 56px 上，
 * 于是上下两个 + 在同一竖线上。落地方式见下面 left-12 + px-2 那两处的算术。
 *
 * 加号**没有框**（不要圆钮、不要描边）：它平时就是一个粗一点的灰 +，直接坐在线上，
 * 靠自己那一小块白底把线在它两边遮掉 —— 看起来就是"线在这儿让开一个口子"。
 * 指到这一行才在它右边浮出「新列表」，颜色不变。
 */
export default function ListDivider({ onAdd }: ListDividerProps) {
  return (
    <div className="group/divider relative h-6">
      {/* 分隔线。inset-x-0：仍旧贯到卡片两边，跟被换掉的 divide-y 一样 */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gray-100"
      />

      {onAdd && (
        /*
          这是个裸 <button>，没用 ui/button：那几个变体都自带盒子（描边 / hover 底 /
          rounded），而这里要的恰恰是"什么都没有"—— 挑一个再逐条抵消，不如直接写。
        */
        <button
          type="button"
          onClick={onAdd}
          aria-label="在此处新增列表"
          className="absolute left-12 top-1/2 flex -translate-y-1/2 items-center text-gray-500"
        >
          {/*
            图标外面这层白底（不是框，是遮线用的）：px-2 让白块比图标两头各宽出 8px，
            线在加号两边就各多断 8px —— 不留这点白，线会贴着笔画走，看着像"线穿过了
            +"。lucide 的 + 本身四周还留了 2px 空隙，加起来每边断口约 10px。

            left-12（48px）+ 这里的 pl-2（8px）= 56px，正是「+ 新列表」那行的 pl-14 ——
            加号就落在跟它同一条竖线上（+ 这个字符自己还有 1px 左右的字边，差这一丝
            看不出来）。
          */}
          <span className="inline-flex bg-white px-2">
            {/* strokeWidth 3：默认那 2 太细，跟这条浅灰线糊在一起，加粗才立得住 */}
            <Plus className="size-4" strokeWidth={3} />
          </span>
          {/*
            「新列表」平时只是不透明度的 0：**占的宽度照旧**，所以线从哪儿开始、加号
            在哪儿，指上去都不会动一下。它自己那块白底只在浮出来时才盖住线 —— 于是
            加号和白底是连着的（中间没有缝让线漏出来），字底下那段线自然被字压住。
            留白放在它自己的 pl 上（而不是两段之间开 gap）：gap 那几像素没有白底，
            一 hover 就会露出一小截线。

            只浮出来、不变色：加号是这一列的"插入口"，指到哪儿都还是那条灰线的一部分，
            变橙会把一整列的分隔线读成一排按钮。
          */}
          <span className="bg-white pl-2 text-sm whitespace-nowrap opacity-0 transition-opacity group-hover/divider:opacity-100">
            新列表
          </span>
        </button>
      )}
    </div>
  );
}
