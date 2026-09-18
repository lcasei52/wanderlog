"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { GripVertical, Trash2, Triangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 触摸上那三个按钮（▲ ▼ 🗑）的接线。挂在每个卡片的 provider 上，
 * 由卡片自己在**展开的那块内容里**摆一个 <CardControls />（见它的说明）。
 */
interface CardControlsValue {
  index: number;
  count: number;
  movable: boolean;
  deletable: boolean;
  deleteTitle: string;
  /** 与相邻那张换位，delta 恒为 ±1 */
  move: (delta: number) => void;
  remove: () => void;
}

const CardControlsContext = createContext<CardControlsValue | null>(null);

/**
 * 触摸上常驻的三个按钮（▲ ▼ 🗑）：跟拖拽等效的重排路径 + 删除。
 *
 * **由卡片自己渲染**，摆在自己的展开内容里，所以只在展开态出现。位置由调用方给
 * （各卡片统一传 `absolute right-1 top-1`，落在卡片**内**的右上角）—— 那是唯一一个
 * 展开态下还空着的角落：地点卡右上仍是那行名称、航班卡右上原本是个折叠箭头。
 *
 * 为什么不让 SortableCardGroup 统一渲染、靠 CSS 判断展开没展开：展开态是每张卡自己的
 * useState，这一层看不见它。要么用 `:has()` 去 DOM 里猜（脆），要么把状态提上来
 * （五张卡都得改）。让卡片自己摆最直接 —— 它本来就知道自己是展开还是收起。
 *
 * 由此带来的约束写在各张卡自己身上：按钮浮在卡片第一行上，那一行**必须**在右边
 * 留出这一段（地点卡是 pointer-coarse:pr-19，三张预订卡是 pr-18），不留就会被压住。
 * 数一下：right-1(4) + 三个 24px 按钮 = 从卡片右沿往里 76px。
 *
 * 为什么恒渲染、只靠 CSS 藏（pointer-coarse:flex + hidden）：pointer: coarse 是 SSR
 * 拿不到的信息，条件渲染必然要么 hydration 对不上、要么闪一帧；而媒体查询是活的 ——
 * iPad 接上触控板时主指针切回 fine，这三个按钮自动让位给桌面那套（柄 + 垃圾桶），
 * 不需要任何监听器。
 *
 * movable / deletable 都为假时整个不渲染：一排三个全灰的按钮比没有入口更让人困惑
 * （每天首尾的酒店行就是这种）。单个动作的不可用落在各自的按钮上 —— 首张的 ▲、
 * 末张的 ▼ 自己灰掉（Button 基类那条 disabled:opacity-50 + disabled:pointer-events-none）。
 */
export function CardControls({ className }: { className?: string }) {
  const ctx = useContext(CardControlsContext);
  if (!ctx || (!ctx.movable && !ctx.deletable)) return null;

  return (
    <div className={cn("pointer-coarse:flex absolute hidden items-center", className)}>
      {/*
        size-6（= icon-xs 的默认尺寸，24px）是触摸目标的下限，再小按不准；
        三个并排 72px，是"塞进右上角"能接受的宽度上限。
        图标：垃圾桶是描边的，得给到 size-4（16px）才够看；上面那两只三角是**实心**的，
        同样 16px 会比垃圾桶重一头，所以退半档到 size-3.5，三个摆一起才匀。

        为什么是实心三角而不是 ChevronUp / ChevronDown：chevron 那两道折线在这个仓库里
        满屏都是"展开 / 收起"（每张折叠卡、每个列表标题都是它），摆在"上移一格"上会先被
        读成"往上展开"。实心三角没有这层歧义。lucide 只有朝上的 Triangle（没有
        TriangleUp/Down），朝下那个 rotate-180 —— 同一个图标翻过来。
        fill-current：lucide 全是描边图标，不填就是个空心三角。
      */}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="上移"
        title="上移"
        disabled={!ctx.movable || ctx.index === 0}
        className="text-gray-400"
        onClick={() => ctx.move(-1)}
      >
        <Triangle className="size-3.5 fill-current" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="下移"
        title="下移"
        disabled={!ctx.movable || ctx.index === ctx.count - 1}
        className="text-gray-400"
        onClick={() => ctx.move(1)}
      >
        <Triangle className="size-3.5 rotate-180 fill-current" />
      </Button>
      {/*
        文案直接复用 deleteTitle：各调用点传的是"从这天移除 / 删除这个航班"
        这类更具体的说法，比笼统的「删除」好。
        没有二次确认 —— 它跟删除菜单项一样只是一次 update，撤销栈照收，
        误触了按撤销就回来了（顶栏那个）。
      */}
      {ctx.deletable && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={ctx.deleteTitle}
          title={ctx.deleteTitle}
          className="text-gray-400"
          onClick={ctx.remove}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

interface SortableCardGroupProps {
  /** 当前顺序的 id 列表（与 renderItem 的渲染顺序一一对应） */
  ids: string[];
  /** 拖放结束后回传新顺序；父组件负责乐观更新本地态 + 落库 */
  onReorder: (orderedIds: string[]) => void;
  /** 提供则在卡片右侧外面显示垃圾桶 */
  onDelete?: (id: string) => void;
  /**
   * 该卡能不能拖（默认都能）。返回 false 的卡不显示拖动柄、拖不走自己，
   * 但仍然可以被别的卡拖到它前/后（位置本身有意义的卡，如每天首尾的酒店）。
   */
  canDrag?: (id: string) => boolean;
  /**
   * 该卡能不能删（默认都能）。返回 false 的卡不显示垃圾桶 ——
   * 派生出来的行（如每天首尾的酒店）不给删：它们的生命周期归父行管，
   * 在这里删掉下次也还会长回来。
   */
  canDelete?: (id: string) => boolean;
  /**
   * 画两张卡之间的"间隔"（从第 2 张起，每张卡上方一条；传 null 就是纯空隙）。
   * beforeId/index = 这条间隔下面那张卡；dragging = 正在拖别的卡 ——
   * 间隔里的交互（比如列表的 + 号）应当在这时让位给橙色插入线。
   * 内容放进一条 `min-h-2` 的容器里（不渲染内容时就是这 8px 空隙）：
   * 返回在流里的内容会按它的高度撑开间隔（如列表/日程里那条 24px 的可交互间隔），
   * 返回绝对定位的元素则维持 8px 不变。
   */
  renderGap?: (beforeId: string, index: number, dragging: boolean) => ReactNode;
  /** 画一张卡的内容（不要自己画拖拽手柄/垃圾桶，这层统一提供） */
  renderItem: (id: string) => ReactNode;
  /**
   * 拖动柄在哪一侧：
   * - `left`（默认）卡片**左沿外面**，跟垃圾桶对称；
   * - `right` 卡片**里面**（地点卡用）—— 它左沿被雨滴图钉压着
   *   （PlaceCard 的 -ml-6），柄摆在外面正好跟图钉抢那一块。
   *
   * ⚠️ 选 `right` 的卡片，自己第一行**要留出右边那点位置**（PlaceCard 的 pr-6）：
   * 柄是浮在卡片上的，不留就会盖住行尾那个金额小标。
   *
   * 两边都是**垂直居中**（top-1/2 -translate-y-1/2）：卡片展开后柄跟着落在卡片中线上，
   * 一眼看得出它是"这张卡"的柄。代价是展开态下它浮在右半边内容的中间（地点卡展开是个
   * 笔记框，柄正好压在那个框的右沿上）—— 它平时是透明的，鼠标移到卡片上才亮，
   * 又只在右沿那一小块，可以接受。
   */
  handleSide?: "left" | "right";
  /** 外层容器的额外 class */
  className?: string;
  /** 垃圾桶的提示文案 */
  deleteTitle?: string;
}

/**
 * 「卡片容器」：给任意一列卡片统一加上 容器内拖动排序 + hover 时才出现的操作按钮。
 *
 * 交互：鼠标移到卡片上 → 卡片左边外面浮现拖动柄、右边外面浮现垃圾桶；
 * 按住拖动柄在容器内上下移动，越过某张卡的中线即插到它前/后（带一条橙色插入线）。
 *
 * 触摸设备上是另一套：那边既没有 hover（Tailwind v4 把 hover: / group-hover:
 * 全包在 @media (hover: hover) 里），也没有原生触摸拖放（draggable 不认手指）——
 * 所以柄和垃圾桶整个摘掉，改用卡片右上角那三个按钮（上移 / 下移 / 删除）—— 它们由卡片
 * 自己摆进展开的那块内容里（<CardControls />），收起时不存在，所以不会挡住卡片自己的摘要。
 * 这几处的判断条件（pointer-coarse）为什么不能换成 max-lg 或 JS，见各自的注释。
 *
 * 实现要点：
 * - 用原生 HTML5 拖放（项目没有拖拽库）：只有拖动柄带 draggable，
 *   拖拽事件从柄冒泡到外层 wrapper，由 wrapper 统一处理 —— 这样卡片内部
 *   的输入框/按钮照常可点，不会整张卡都变成拖拽热区。
 * - 拖动影像是整张卡（setDragImage 传 wrapper），而不是那个小按钮。
 * - 卡片间距是 wrapper 里一条真实的 `min-h-2` 间隔元素（不是 padding），
 *   这样间隔里可以放东西（列表的插入点、Day 的连接线），并且能被 hover / 撑高。
 * - 顺序只在本地算好回传，持久化交给调用方（各 context 的 reorder* 动作）。
 */
export default function SortableCardGroup({
  ids,
  onReorder,
  onDelete,
  canDrag,
  canDelete,
  renderGap,
  renderItem,
  handleSide = "left",
  className,
  deleteTitle = "删除",
}: SortableCardGroupProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // 当前悬停在哪张卡上、插到它前面还是后面（决定插入线的位置）
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    after: boolean;
  } | null>(null);
  // 拖影需要拿到整张卡的 DOM 节点
  const itemRefs = useRef(new Map<string, HTMLDivElement | null>());

  const reset = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  // 拖动柄上的 dragstart 冒泡到这里（用 HTMLElement 泛型，卡片容器与按钮两种 target 都能接）
  const handleDragStart = (e: DragEvent<HTMLElement>, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    // 有的浏览器（Firefox）不设数据就不会启动拖拽
    e.dataTransfer.setData("text/plain", id);
    const el = itemRefs.current.get(id);
    if (el) e.dataTransfer.setDragImage(el, 24, 16);
  };

  const handleDragOver = (e: DragEvent<HTMLElement>, id: string) => {
    if (!draggingId || draggingId === id) return;
    e.preventDefault(); // 不 preventDefault 就不允许 drop
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDropTarget((prev) =>
      prev?.id === id && prev.after === after ? prev : { id, after },
    );
  };

  const handleDrop = (e: DragEvent<HTMLElement>, id: string) => {
    e.preventDefault();
    const movingId = draggingId;
    if (!movingId || movingId === id) return reset();

    const after = dropTarget?.id === id ? dropTarget.after : false;
    const next = ids.filter((x) => x !== movingId);
    next.splice(next.indexOf(id) + (after ? 1 : 0), 0, movingId);
    reset();

    if (next.join("|") !== ids.join("|")) onReorder(next);
  };

  /**
   * 触摸上那两个三角按钮（▲ / ▼）：把这张卡跟相邻的那张换个位置（delta 只有 -1 / +1）。
   *
   * 为什么在组件里自己算顺序、而不是给调用方加一个 onMove：拖拽结束时回传给 onReorder 的
   * 本来就是"这一列的完整 id 顺序"，换一格也是同一个东西 —— 复用 onReorder 之后，
   * 五个调用点、各 context 的 reorder*、四个 server action 全都不用为触摸多开一条路。
   *
   * 越过得过 canDrag 为 false 的卡是**故意允许**的：那类卡（每天首尾的酒店行）只是
   * 自己不能被拖走，别的卡本来就可以拖到它前/后（见上面 canDrag 的说明）。这里跟拖拽
   * 保持同一套语义，不另立规矩。
   *
   * |delta| 恒为 1，所以直接交换两项就够，别写 splice 里再套 splice 那种
   * 要在脑子里跑一遍求值顺序的写法。
   */
  const moveBy = (id: string, delta: number) => {
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    onReorder(next);
  };

  return (
    <div className={className}>
      {ids.map((id, index) => {
        // 这张卡能不能动 / 能不能删。触摸上那三个按钮各自可不可用、以及"这张卡到底要不要
        // 有那三个按钮"都看这两个 —— 两个都为假的卡（如每天首尾的酒店行）整个不渲染
        // （判断在 CardControls 里，值从下面那个 Provider 传进去）。
        const movable = canDrag ? canDrag(id) : true;
        // onDelete 本身是可选 props，不能只看 canDelete
        const deletable = !!onDelete && (canDelete ? canDelete(id) : true);

        return (
          <div
            key={id}
            ref={(el) => {
              itemRefs.current.set(id, el);
            }}
            className={cn(
              "group/card relative",
              draggingId === id && "opacity-40",
            )}
            onDragOver={(e) => handleDragOver(e, id)}
            onDrop={(e) => handleDrop(e, id)}
          >
            {/* 与上一张卡之间的间隔（第一张卡上方不空出高度，组外层间距不变） */}
            {index > 0 && (
              <div className="relative min-h-2">
                {renderGap?.(id, index, draggingId !== null)}
              </div>
            )}

            {/* 卡片本体 + 浮在它外面左右两侧的操作按钮（都以卡片盒为定位参照） */}
            <div className="relative">
              {/* 插入位置提示线（-top-1 / -bottom-1 = 落在相邻两条间隔的中线上） */}
              {dropTarget?.id === id && (
                <span
                  className={cn(
                    "pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-orange-400",
                    dropTarget.after ? "-bottom-1" : "-top-1",
                  )}
                />
              )}

              {/*
                接线（上移 / 下移 / 删除）只包住 renderItem 出来的那棵子树，不包柄和垃圾桶：
                那两只是这一层自己的、跟卡片无关。卡片在它自己的展开内容里摆一个
                <CardControls />，取到的就是下面这份值。

                为什么卡片不自己算：它只知道"我是哪一条"，不知道自己在第几位、这张能不能动、
                删掉该走哪个回调 —— 那些都是这一层的知识（ids / canDrag / canDelete / onDelete）。
                做成 render prop 往下传也可以，但五个调用点的 renderItem 签名全得跟着改，
                而这些卡片是自定义 hooks + context 的组织方式，本来就习惯从 context 里取依赖。
              */}
              <CardControlsContext.Provider
                value={{
                  index,
                  count: ids.length,
                  movable,
                  deletable,
                  deleteTitle,
                  move: (delta) => moveBy(id, delta),
                  remove: () => onDelete?.(id),
                }}
              >
                {renderItem(id)}
              </CardControlsContext.Provider>

              {/* 拖动柄：hover 卡片时浮现（canDrag 为 false 的卡不给柄）。
                  位置见 handleSide —— 默认在卡片左沿外面，地点卡在卡片里面。

                  触摸设备上整只摘掉（pointer-coarse:hidden → display:none）。那边不是
                  "看不见"，是这套样式**根本不匹配** —— Tailwind v4 把 hover: / group-hover:
                  全都包在 @media (hover: hover) 里（可以在编译产物里核对），触摸设备一条都命中不了。
                  更没有拖放：draggable 是给指针设备的，移动端浏览器不实现触摸拖放，
                  留着它就是"看不着又拖不动"。重排改走右上角那三个按钮。

                  键盘不亏：这把柄本来就能 Tab 到、却按不动（拖放没法用键盘发起），摘掉它
                  反而少一个死胡同；触摸设备上的删除和重排都在那三个按钮里，照样能键盘操作。 */}
              {movable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  draggable
                  aria-label="拖动排序"
                  title="按住拖动，在容器内调整顺序"
                  className={cn(
                    "pointer-coarse:hidden absolute cursor-grab text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 active:cursor-grabbing group-hover/card:opacity-100 focus-visible:opacity-100",
                    handleSide === "right"
                      ? // pointer-events 跟着 hover 开关：柄浮在卡片里，透明时若还能接指针，
                        // 卡片右沿就多出一条点不动的死区（左边那个在卡片外面，没这问题）。
                        // 鼠标移到卡片上 group-hover 先亮，柄就活了；拖拽照常。
                        // （垂直居中的位置见 handleSide 的说明。）
                        "right-1 top-1/2 -translate-y-1/2 pointer-events-none group-hover/card:pointer-events-auto focus-visible:pointer-events-auto"
                      : "-left-6 top-1/2 -translate-y-1/2",
                  )}
                  onDragStart={(e) => handleDragStart(e, id)}
                  onDragEnd={reset}
                >
                  <GripVertical className="size-3.5" />
                </Button>
              )}

              {/* 垃圾桶：卡片右边外面，hover 卡片时浮现（canDelete 为 false 的卡不给）。

                  触摸上同样摘掉。顺带说一句它原来的坑：这只桶只有 opacity-0、**没有**
                  pointer-events-none（对比上面那把右侧柄，那边是特意加了开关的），
                  而 opacity-0 的元素照样吃点击 —— 也就是说在触摸设备上它虽然永远看不见，
                  却一直是活的，而删除又没有二次确认（见 SimpleSidebar 里同一处提醒）。
                  摘掉它正好把这个"在卡片右沿外误触就静默删掉一条"的口子一起堵上。 */}
              {deletable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={deleteTitle}
                  title={deleteTitle}
                  className="pointer-coarse:hidden absolute -right-6 top-1/2 -translate-y-1/2 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover/card:opacity-100 focus-visible:opacity-100"
                  onClick={() => onDelete?.(id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}

              {/*
                触摸上那三个按钮（▲ ▼ 🗑）不在这儿渲染 —— 它们由卡片自己摆在**展开的那块
                内容里**（<CardControls />），所以只在展开态出现、落在卡片内部的右上角。
                接线就是上面那个 Provider。原因见 CardControls 的说明。
              */}
            </div>
          </div>
        );
      })}
    </div>
  );
}
