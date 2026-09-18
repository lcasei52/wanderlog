import { cn } from "@/lib/utils";
import { LoadingHint, SkeletonBar } from "@/components/LoadingSkeleton";

/**
 * 首页（/home）的加载屏。跟 plan/[tripId]/loading.tsx 是同一个套路，那边把来龙去脉写全了，
 * 这里只说不一样的地方。
 *
 * 为什么首页也需要：从行程页回来走的是顶栏那颗 Map 图标 / 「主页」链接（header.tsx），
 * 或者 PlanHeader 里那颗 logo —— 全是同一个 /home。而首页也是 force-dynamic
 * （见 page.tsx），每次回来都得重新查一遍 trips 表。于是症状跟"点行程卡"一模一样：
 * 点了没反应，过一两秒才换页。
 *
 * ★ 这里**不画顶栏的骨架**。Header 在 (globe-header)/layout.tsx 里，它是 layout 的一部分、
 *   导航时不会卸载，一直好好地挂在上面 —— 再画一条灰的顶栏等于告诉用户"顶栏也要重新加载"，
 *   而且真顶栏就在它上面，两条会叠在一起。
 *
 * ★ 父级是 layout 里那个 <main className="flex-1">，它**没有高度上下文**（外层不是 flex，
 *   flex-1 在那儿是空转），所以不能像行程页那样 h-full。这里用 min-h-[calc(100vh-4rem)]
 *   自己撑出一屏：4rem 就是 Header 的 h-16，改顶栏高度时这个数得跟着改。撑这一屏是为了
 *   中间那枚胶囊能落在屏幕正中 —— 不撑的话它只会居中在骨架自己那 700 来 px 里。
 *
 * ★ 服务端组件，不要 "use client"（理由同行程页：全是静态灰块，脉冲是 CSS）。
 *
 * 摆位对着 HomeTrips 抄，抄的是结构和关键尺寸。首页改动（比如标题行换布局、卡片换比例）
 * 不会自动同步到这一屏，得回来补。
 */
export default function HomeLoading() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)]">
      {/*
        骨架整体 aria-hidden：它只是"真页面要来了"这个形状，读屏念一堆没内容的方块只是
        噪音。要说的那句话在最后那枚胶囊上（那边有 role="status"）。
      */}
      <div aria-hidden className="app-shell py-8">
        <section className="mb-12">
          {/*
            标题行。断点跟 HomeTrips 里那一行一样是 sm（那边写死 sm 是有理由的：标题满宽
            加按钮满宽刚好卡在 640 上下，见那边的注释）。
            两个灰条的高度对着各自的字：h1 是 text-3xl（36px 行高）→ h-9，
            按钮是默认尺寸 h-8、px-6、五个字加一颗图标 ≈142px → w-36。
          */}
          <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
            <SkeletonBar className="h-9 w-72" />
            <SkeletonBar className="h-8 w-36 rounded-full" />
          </div>

          {/* 筛选行：左边那个下拉 + 右边的「查看全部」，都是 text-sm → h-5 */}
          <div className="mb-6 flex items-center justify-between">
            <SkeletonBar className="h-5 w-24" />
            <SkeletonBar className="h-5 w-16" />
          </div>

          {/*
            卡片网格。**画几张是算过的**：真页面每页的条数是跟着窗口走的
            （HomeTrips 里的 itemsPerPage：<768 两张、<1024 三张、再往上四张），
            网格本身也是 grid-cols-2 / md:3 / lg:4 —— 两者本来就对齐，所以这里
            放四张、后两张按断点藏起来，三种屏宽下都跟真页面的张数一模一样。
            写成"永远画四张"的话，md 上会多出孤零零的第二行、小屏上多出整整一行，
            数据到了那一下会明显缩一下。

            分页圆点/左右箭头不画：它们只在超过一页时才有，而"有几页"正是这一屏
            还不知道的东西。

            另外这张网格假设了"有行程"。一条都没有时真页面落在那块虚线空框上，
            骨架没法知道 —— 也接受，骨架只是过渡，不承诺跟真页面逐块对齐。
          */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {CARD_SLOTS.map((slot, i) => (
              <div
                key={i}
                className={cn(
                  "overflow-hidden rounded-lg border bg-white",
                  slot,
                )}
              >
                {/* 封面：跟真卡片一样是 aspect-[4/3]，rounded-none + 外层 overflow-hidden
                    才能让四个角跟着卡片走 */}
                <SkeletonBar className="aspect-[4/3] w-full rounded-none" />
                {/* 卡片信息：h3 是 font-semibold 带 mb-2，下面那行是 text-sm */}
                <div className="p-3">
                  <SkeletonBar className="mb-2 h-5 w-3/4" />
                  <SkeletonBar className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 第二块：真页面那里现在是个 h-64 的占位框，也跟着摆一块 */}
        <section>
          <SkeletonBar className="h-64 w-full rounded-lg" />
        </section>
      </div>

      <LoadingHint label="正在回到首页…" />
    </div>
  );
}

/**
 * 四张卡片各自的显隐，对着真页面的每页条数：base 两张、md 三张、lg 四张。
 * 前两张空串是"一直显示" —— 写成 "" 而不是省略，是为了让这张表读起来是四行对齐的。
 */
const CARD_SLOTS = ["", "", "hidden md:block", "hidden lg:block"];
