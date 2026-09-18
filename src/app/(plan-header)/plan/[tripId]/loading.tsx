import { Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingHint, SkeletonBar } from "@/components/LoadingSkeleton";

/**
 * 行程详情页的加载屏（App Router 的 loading.tsx）。
 *
 * 它是这一段（plan/[tripId]）的 Suspense fallback：从 /home 点一张行程卡、导航开始的
 * 那一瞬间就顶上去，数据回来再换成真页面。没有它的话 App Router 默认是"等新页面渲染好
 * 才切" —— 中间那几秒页面**原地不动**，用户读成"卡了"，然后去点第二下或者按刷新。
 *
 * 那几秒是真的：这一页是 force-dynamic，每次进都要打 10 条查询到 Neon，而本机到 Neon
 * 一趟往返一两秒（见 db/client.ts），withRetry 重试时更久。这一屏治的是"没有反馈"，
 * 不是"慢" —— 想让它真的快是另一件事。
 *
 * 覆盖面不止"点卡片进去"：新建行程提交后那条 router.push(`/plan/${id}`) 走的是同一个段，
 * 一样吃这一屏。F5 硬加载时它通常也会先画出来（流式 HTML 的头一段就是这个 fallback）。
 *
 * ★ 保持默认的服务端组件，**不要写 "use client"**：下面全是静态灰块，脉冲是 CSS 的
 *   animate-pulse，一点 state 都不需要。加了就等于为一个纯装饰的东西给整页添一份客户端 JS。
 *
 * ★ 父级是 (plan-header)/layout.tsx 那个 `flex h-screen w-full`，所以这里 h-full 就铺满
 *   整屏；relative 是给中间那枚居中提示当定位父级。
 *
 * 摆位是对着真页面抄的，抄的是**结构和关键尺寸**、不是内容（数字文案一律灰条）。所以它
 * 是"照着真页面画的一张画"，不是从真页面导出的 —— 哪天侧栏多出一组、正文多出一节，
 * 这一屏不会自己跟上，得回来补。每块对应谁写在各自旁边。
 *
 * 灰条和那枚居中胶囊本身在 components/LoadingSkeleton.tsx（首页的 loading.tsx 用的是
 * 同一套）—— 为什么不用 ui/skeleton.tsx、为什么必须 motion-reduce 一起关，都写在那边。
 */
export default function TripLoading() {
  return (
    <div className="relative flex h-full w-full bg-gray-50">
      {/*
        骨架整体 aria-hidden：它只是"真页面要来了"这个意思的形状，读屏念一堆没有内容的
        方块只是噪音。要说的话在最后那枚胶囊上（那里有 role="status"）。
      */}
      <div
        aria-hidden
        /*
          左列：顶栏 + （侧栏 | 正文）。
          lg:w-[46%] 这个比例是**估的**，不是量出来的 —— 真页面那一列是 lg:flex-initial、
          由内容自然撑开，骨架里没有内容可撑。切换时横向会有一下小跳，可以接受：真要抠准
          得等真页面渲染完，那就没有骨架屏了。别把它当成一个必须对齐的魔数。
        */
        className="flex h-full min-w-0 flex-1 flex-col lg:w-[46%] lg:flex-none"
      >
        {/* 顶栏：照 PlanHeader 的 h-16 / border-b / 那套左右内边距 */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b bg-white pl-4 pr-3 lg:pl-16 lg:pr-8">
          {/* 左：logo + 分隔线 + 撤销重做那一格 */}
          <div className="flex items-center gap-2 lg:gap-4">
            <SkeletonBar className="h-6 w-6" />
            <div className="h-6 w-px bg-gray-200" />
            <SkeletonBar className="h-8 w-16" />
          </div>
          {/* 右：计划/游记（sm 以下真页面也是收起来的）+ 分享 + 更多 */}
          <div className="flex items-center gap-2 lg:gap-3">
            <SkeletonBar className="hidden h-8 w-24 rounded-full sm:block" />
            <SkeletonBar className="h-8 w-16 rounded-full" />
            <SkeletonBar className="h-8 w-8 rounded-full" />
          </div>
        </div>

        <div className="relative flex flex-1 overflow-hidden">
          {/*
            侧栏：跟 SimpleSidebar 一样是 max-lg:hidden —— 手机上侧栏是抽屉（MobileSidebar），
            流里没有它，所以这里也必须 hidden lg:block，否则窄屏会凭空多出一条竖栏。
            宽度 w-48 是 SimpleSidebar 展开态写死的那个数。
            顶部 h-18 那个空档是给桌面那颗跨界 AI 胶囊让位的（那边是 h-18 的留白）。
          */}
          <aside className="hidden h-full w-48 shrink-0 border-r bg-white lg:block">
            <div className="h-18" />
            <div className="space-y-4 px-2 py-2">
              {SIDEBAR_GROUPS.map((group, i) => (
                <div key={i}>
                  {/* 大类标题行：图标 + 标签（真实那行是 mx-2 + pl-3） */}
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <SkeletonBar className="h-5 w-5 shrink-0" />
                    <SkeletonBar className="h-5 w-16" />
                  </div>
                  {/* 子项：ul 是 px-2、每项自己再 px-3（两边加起来 20px），跟大标题文字对齐 */}
                  <div className="space-y-0.5 px-2">
                    {group.map((width, j) => (
                      <div key={j} className="px-3 py-1.5">
                        <SkeletonBar className={cn("h-4", width)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* 正文列：DetailContent 那一列 */}
          <div className="flex-1 overflow-hidden bg-gray-50">
            {/* 封面 h-64（真页面的封面也是写死的 h-64） */}
            <SkeletonBar className="h-64 w-full rounded-none" />

            {/*
              标题卡：-mt-19 是把它往上提半个卡高、骑在封面下沿上 —— 跟 DetailContent
              里那个完全一样，所以这里也照抄，不然两张卡的位置对不上。
            */}
            <div className="relative z-10 -mt-19 px-6">
              <div className="rounded-lg bg-white p-6 shadow-sm">
                <SkeletonBar className="h-8 w-2/3" />
                <div className="mt-4 flex items-center gap-3">
                  <SkeletonBar className="h-4 w-28" />
                  <SkeletonBar className="h-4 w-24" />
                </div>
              </div>
            </div>

            {/* 概览：上面那行两张卡（2/3 + 1/3）+ 下面那张大列表卡 */}
            <div className="mt-6 space-y-8 px-2 pb-8 lg:px-6">
              <div className="grid grid-cols-3 gap-4">
                <SkeletonBar className="col-span-2 h-32 rounded-lg" />
                <SkeletonBar className="col-span-1 h-32 rounded-lg" />
              </div>

              {/* 列表卡：四节（Notes / Flights / Trains / Hotels），每节一行标题 */}
              <div className="divide-y divide-gray-100 overflow-hidden rounded-lg bg-white shadow-sm">
                {LIST_ROW_WIDTHS.map((width, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-5 lg:px-6"
                  >
                    <SkeletonBar className="h-6 w-6 shrink-0" />
                    <SkeletonBar className={cn("h-6", width)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/*
        右列：地图。真页面上这一列外面还套着一层 absolute 的浮层壳（手机上它靠
        translate-x-full + invisible 藏起来），流里留下的就是"桌面可见、手机不存在"
        这一件事，所以这里 hidden lg:flex 就够。
      */}
      <div
        aria-hidden
        className="hidden border-l border-gray-200 bg-gray-100 lg:flex lg:flex-1 lg:items-center lg:justify-center"
      >
        <MapIcon className="h-10 w-10 text-gray-300" />
      </div>

      {/*
        中间那枚提示。它能"浮在整屏正中"全靠上面那个 relative + h-full 的根节点
        （组件内部是 absolute inset-0）—— 别把根节点那个 relative 删了。
      */}
      <LoadingHint label="正在打开行程…" />
    </div>
  );
}

/**
 * 侧栏那三组各自挂几条子项、每条多宽（宽度不同才不像一张表格）。
 * 对着 SimpleSidebar 的 groups 数的：概览=Notes/Flights/Trains/Hotels+各地点列表，
 * 行程=每天，预算=一条「查看」。
 */
const SIDEBAR_GROUPS: string[][] = [
  ["w-12", "w-14", "w-14", "w-16", "w-20"],
  ["w-24", "w-24", "w-24"],
  ["w-8"],
];

/** 概览里那张列表卡的行（Notes / Flights / Trains / Hotels 四节标题） */
const LIST_ROW_WIDTHS = ["w-16", "w-20", "w-16", "w-20"];
