import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 路由级加载屏（`app/**​/loading.tsx`）共用的两小块：一根灰条 + 那枚居中的提示胶囊。
 *
 * 抽出来是因为现在有两屏在用同一套（行程详情页、首页）—— 留在各自的 loading.tsx 里
 * 就得各写一份，改个底色或尺寸还得记得改两处。
 *
 * 这一层两个 loading.tsx 都没有 "use client"，脉冲全靠 CSS animate-pulse，所以这里也
 * **不要**写 "use client"：写了整屏就为几个装饰性的方块多背一份客户端 JS。
 */

/**
 * 一根灰条。宽高由调用方传类进来（`w-24` / `h-6` / `aspect-[4/3]` …）。
 *
 * ★ 没用 ui/skeleton.tsx：它的底色是 bg-muted，而本项目的 --muted 是 oklch(0.97 0 0)
 *   （globals.css），跟正文那一层的 bg-gray-50 肉眼分不出来 —— 灰条会"隐形"。
 *   这里直接钉 bg-gray-200，对比度够、又不至于像一块黑板。
 *
 * motion-reduce:animate-none 跟着仓库既有规矩：脉冲是装饰动效，该跟着系统的
 * "减少动态效果"一起关掉。
 */
export function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-gray-200 motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/**
 * 浮在正中的那枚「正在…」胶囊。
 *
 * ★ 调用方必须是 `relative`（它的定位父级），而且**那一层的高度约等于整屏可见区**。
 *   塞进正文列里的话，窄屏、滚动位置的差异都会影响它落在哪，"居中"就是假的。
 *
 * role="status" 让读屏播报这一句 —— 骨架本身应当 aria-hidden（它只是"真页面要来了"
 * 这个意思的形状，念一堆没有内容的方块只是噪音），所以那句话只能挂在这儿。
 * pointer-events-none：纯显示的东西，别去挡底下的可点区域。
 */
export function LoadingHint({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div
        role="status"
        className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 shadow-sm"
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-orange-500 motion-reduce:animate-none" />
        <span className="text-sm text-gray-600">{label}</span>
      </div>
    </div>
  );
}
