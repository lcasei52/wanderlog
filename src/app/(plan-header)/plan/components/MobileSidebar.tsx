"use client";

import { cn } from "@/lib/utils";
import type { TripSummary } from "@/types/trip";
import SimpleSidebar from "./SimpleSidebar";

interface MobileSidebarProps {
  /** 抽屉开没开 */
  open: boolean;
  /** 点遮罩 / 点「隐藏侧边栏」都走它 */
  onClose: () => void;
  trip?: TripSummary;
  activeSection?: string | null;
  activeSubId?: string | null;
}

/**
 * 手机上的侧栏抽屉（< lg 才存在）。
 *
 * 装的就是桌面那份目录本身 —— 复用 SimpleSidebar 的 variant="drawer"，只是换了容器：
 * 桌面是长在流里的一条竖栏，这里是 fixed 从左边滑进来的浮层，外加一层遮罩。
 * 内容一份、宽度一套，两边不会慢慢分叉。
 *
 * 三层结构（顺序不能动）：
 *   1. lg:hidden 外壳 —— 只是个开关，**不能带 transform/filter**，
 *      否则里面两个 fixed 会改以它为定位基准，跑偏。
 *   2. 遮罩 fixed inset-0 z-40 —— 盖住右边剩下的正文，点一下关抽屉。
 *      用户要的"展开时正文被遮盖不能操作"就是它（正文本身没被禁用，
 *      是这一层把点击全吃掉了）。关着时靠 pointer-events-none 放行。
 *   3. 抽屉 fixed inset-y-0 left-0 z-50 —— 宽度见下。
 *
 * z 层级跟 AiAssistant.tsx 的 遮罩 z-40 / 面板 z-50 对齐，两套是同一档的东西。
 */
export default function MobileSidebar({
  open,
  onClose,
  trip,
  activeSection,
  activeSubId,
}: MobileSidebarProps) {
  return (
    <div className="lg:hidden">
      {/* 遮罩：点空白处关抽屉 */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          "fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 motion-reduce:transition-none",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/*
        抽屉宽度：w-[45%] + 下限 min-w-42(168px) + 上限 max-w-60(240px) —— 三个数是一组，一起看。

        桌面那个"侧栏 : 正文 ≈ 1 : 2.6 ~ 1 : 3.9"（左列由内容撑开，正文列 flex-1 基 0，
        实际宽度量级 500~750px）照搬到 375px 屏上只有 96~125px，而目录里最长那行
        「周四 · 9月18日」自己就要 ~112px，加上 ul 的 px-2 和按钮的 px-3（共 40px）——
        **行宽下限 168px**。低于它日期就被 truncate 成「周四 · 9月…」，
        各地点列表名（用户自起的，通常更长）更是全军覆没。

        所以取 45% 保住"跟着屏幕比例伸缩"这件事本身（大屏手机自动变宽），
        再用 min 兜住不截断、用 max 封顶免得在折叠屏/横屏上长成一块大抽屉。
        要调就改这一行。

        inert：关着的时候抽屉只是移出视野，仍留在 Tab 序里；SimpleSidebar 内部那两处
        inert 只管展开/折叠两层，管不到整个抽屉，所以这里得补一个。
      */}
      <div
        inert={!open}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[45%] min-w-42 max-w-60",
          "shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SimpleSidebar
          variant="drawer"
          trip={trip}
          activeSection={activeSection}
          activeSubId={activeSubId}
          onHide={onClose}
        />
      </div>
    </div>
  );
}
