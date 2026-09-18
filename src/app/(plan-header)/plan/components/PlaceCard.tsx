"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Link as LinkIcon, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PlaceItem } from "@/types/place";
import { usePlaces } from "@/context/places-context";
import { useExpenses } from "@/context/expenses-context";
import { cn, formatCurrency } from "@/lib/utils";
import { CardControls } from "@/components/SortableCardGroup";
import LinkedExpenseButton from "./overview/LinkedExpenseButton";
import VisitedButton, { visitedToggleFeedback } from "./VisitedButton";
import PlaceKindBadge from "./PlaceKindBadge";
import { placeKindOf } from "@/lib/place-kinds";

/** 已访问 mini marker 的固定灰色（与地图一致） */
const VISITED_SLATE = "#94a3b8";

/**
 * 地点行的分发：酒店（住宿自动挂上的那些行）渲染成一行小字，其余一律照常是卡片。
 *
 * 放在这里而不是调用方（DayCard / PlacesList），是为了让"酒店行永远是小字"
 * 成为一条全局规则 —— 不管它被渲染在哪个容器里都一致。
 */
export default function PlaceCard({ item }: { item: PlaceItem }) {
  if (placeKindOf(item) === "hotel") return <HotelLine item={item} />;
  return <PlaceCardBody item={item} />;
}

/**
 * 地点卡：可嵌入任何地点列表 / DayCard 容器。
 * 收起态 = 灰底圆角框 + 最左容器色 mini marker（序号与地图一致）+ 名称/详情/备注；
 * 点击展开就地编辑（笔记/时间/附件/费用占位），同时保持原有动作：地图聚焦 + 打开 PlaceDetailCard；
 * 展开后点卡片外部自动收起。时间/附件弹层用 Portal 渲染到 body，避免被外层容器裁切。
 * 拖动排序 / 删除由外层 SortableCardGroup 提供：垃圾桶浮在卡片右沿外面，拖动柄在
 * 卡片**里面**（handleSide="right" —— 左沿被图钉占着，见下）。
 */
function PlaceCardBody({ item }: { item: PlaceItem }) {
  const { selectItem, itemNumber, itemColor, updateItem } = usePlaces();
  const { expenses } = useExpenses();

  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(item.note ?? "");
  const noteFocusedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // 始终是最新 note 的 ref（点外部收起时也能拿到输入中的内容）
  const noteRef = useRef(note);
  noteRef.current = note;
  // 最近一次已提交到 DB 的 note，避免重复提交
  const lastSavedRef = useRef(item.note ?? "");

  // 外部（其它入口/DB 刷新）改了 note 时同步回来；正在输入时不打断
  useEffect(() => {
    if (!noteFocusedRef.current) {
      setNote(item.note ?? "");
      lastSavedRef.current = item.note ?? "";
    }
  }, [item.note, item.id]);

  const commitNote = () => {
    const current = noteRef.current;
    if (current !== lastSavedRef.current) {
      updateItem(item.id, { note: current });
      lastSavedRef.current = current;
    }
  };

  // 展开后点外部（不在本卡、也不在时间/附件弹层、对话框、toast 里）→ 收起
  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | Element | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      // 这些是 portal 出去的浮层/弹窗，属于本卡或系统级，不当作"外部"
      if (
        typeof (target as Element).closest === "function" &&
        (target as Element).closest(
          "[data-inline-pop],[role='dialog'],[data-sonner-toaster]",
        )
      ) {
        return;
      }
      setExpanded(false);
      commitNote();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const visited = item.visited;
  const number = itemNumber(item);
  const containerColor = visited ? VISITED_SLATE : itemColor(item);

  const detailLine = item.address ?? item.tel ?? null;
  const timeSet = item.timeFrom && item.timeTo;
  const timeText = timeSet ? `${item.timeFrom} - ${item.timeTo}` : null;
  const noteText = item.note?.trim();

  /*
   * 收起态要显示的那个金额。展开后同一个数在操作行里还有一个框（见下面的
   * LinkedExpenseButton），所以这里只给收起态用 —— 不然一屏两个金额。
   *
   * 查两遍是故意的：这一处只是个显示用的 span，那个按钮自带自己的查询和两个弹窗。
   */
  const linkedExpense = expenses.find(
    (e) => e.linkedItemType === "place" && e.linkedItemId === item.id,
  );

  const handleRowClick = () => {
    if (expanded) {
      commitNote();
      setExpanded(false);
    } else {
      setExpanded(true);
    }
    selectItem(item.id); // 聚焦地图(条件) + 打开 PlaceDetailCard（动作不变）
  };

  const toggleVisited = () => {
    const was = item.visited;
    updateItem(item.id, { visited: !was });
    visitedToggleFeedback(was);
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        // relative：展开时那三个触摸按钮（CardControls）是绝对定位到这张卡的右上角的，
        // 得有一个定位参照（它们只在展开态存在，但参照物得一直在）。
        // px-2（8px）只在手机上：这张卡在行程/列表里层层嵌套，外层已经各留了一点，
        // 卡内再留 12px 在 375px 上就明显了。lg 以上回到 px-3。
        // 改这个数要连着看下面图钉的 -ml-5 / lg:-ml-6 —— 那是一对（见那里的算术）。
        "relative rounded-lg bg-gray-100 px-2 py-2 lg:px-3",
        expanded ? "" : "hover:bg-gray-50 cursor-pointer",
      )}
    >
      {/*
        收起/展开 头部行。右边留多宽，取决于这一行右边浮着什么：

        - 桌面：pr-6 是给拖动柄留的。柄浮在卡片里面、垂直居中（SortableCardGroup 的
          handleSide="right"），**收起态下整张卡就是这一行**，居中正好落在行尾，
          不留就会盖住那个金额小标。（展开态下柄会落到卡片中间，但那时金额小标本来
          就不显示了。）
        - 触摸：柄没有了，换成卡片右上角那三个按钮（▲ ▼ 🗑）。它们**只在展开时出现**，
          但仍然是压在这一行右端的（展开态下这一行还是最上面那行），横向占 76px ——
          不留出 pr-19（76px）名字就会被压住。
          算一遍：按钮从卡片右沿往里 4(right-1) + 72(三个 size-6) = 76px，行内容右沿
          在 8(px-2) + 76 = 84px 处 —— 就是 pr-19 加上 px-2，正好贴住按钮左沿。
          （收起态不必再留：那时这三个按钮压根不渲染，pr-19 只是没害处。）

        收起来的那个右三角箭头（原来在这一行最右）已经去掉 —— 它跟柄是同一个位置，
        而且展开与否看内容就知道，不必再要一个箭头。
      */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRowClick();
          }
        }}
        className="flex items-start gap-2 cursor-pointer group pr-6 pointer-coarse:pr-19"
      >
        {/*
          图钉：手动地点 = 容器色 + 序号；机场/酒店/车站 = 来源色 + 图标（与地图一致）。

          -ml-6 只在 lg 以上：那里卡片内边距是 px-3(12px)，再往左 24px 正好让这个 24px
          宽的图钉**中心落在卡片左沿上** —— 一半在卡里、一半在卡外，像钉在卡片边上。
          它不是绝对定位，仍是这一行 flex 里的一项，所以戳出去的那半照样是卡片的一部分：
          点它一样能展开这张卡，点外面收起时它也还算"卡内"。
          ★ 这跟上面那个 px-3 是一对：-24 + 12 = -12，动一个就得动另一个
          （改错的表现是图钉偏离卡片边沿，肉眼看得出来）。
          （PlaceDayGap 那条点线的位置就照着这个中心来，动它要一起动。）

          **手机上不再往外戳**（从前是 -ml-5）：卡内边距只有 8px，往外 20px 会把图钉
          整个推到卡片外面 —— 在行程那种"卡片外面还有一层内边距"的容器里看着就是漏出去了。
          现在它老老实实待在卡片里（占满题头左侧那 24px），名字因此从 20px 挪到 40px；
          下面展开区那份内容的 pl-10 得跟着对（见那里的说明）。

          -mt-0.5 把水滴头抬到跟第一行标题同一条中线上（外框 py-2 = 8px，再往上 2px）。
        */}
        <PlaceKindBadge
          item={item}
          number={number}
          color={containerColor}
          variant="pin"
          className="-mt-0.5 lg:-ml-6"
        />

        {/*
          字号比别处大一号（名称 text-base、下面两行 text-sm）：这张卡在行程里是
          正文，一屏就那么几张，看得清比塞得下要紧。（酒店那行小字没跟着放 ——
          它是住宿行的投影，本来就不该抢眼。）
        */}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-base text-gray-800 leading-snug truncate",
              visited && "line-through decoration-gray-300",
            )}
          >
            {item.name}
          </p>
          {noteText && (
            <p className="text-sm text-gray-500 leading-snug line-clamp-2 wrap-break-word whitespace-pre-wrap">
              {noteText}
            </p>
          )}
          {(detailLine || timeText || item.url) && (
            <p className="text-sm text-gray-400 truncate">
              {[detailLine, timeText, item.url].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/*
          收起态也能看到这笔地点上有钱。
          做成纯 span 不是按钮：这一整行已经是 role="button"（点了展开），在里面
          再套一个可点元素会变成"点一下既展开又弹窗"，而且 role=button 里不该放
          交互子元素。要改金额就展开点那个蓝框。
          !expanded：展开后同一个金额在操作行里还有一个框，留着这里就显示两遍。
        */}
        {!expanded && linkedExpense && (
          <span className="mt-0.5 shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-600">
            {formatCurrency(linkedExpense.amount, linkedExpense.currency)}
          </span>
        )}
      </div>

      {/* 展开：就地编辑。左边距跟着名称那一行：pl-5(20px) 是 lg 以上的数（图钉压在卡片
          边上，名称从 20px 起）；手机上图钉收进卡里了，名称从 40px 起，所以是 pl-10。
          ★ 跟上面图钉那处是一对，改一个要瞄一眼另一个。 */}
      {expanded && (
        <div className="mt-2 pl-10 space-y-2 lg:pl-5">
          {/*
            触摸上那三个按钮（▲ ▼ 🗑）就摆在这儿 —— 挂在展开区里，所以只在展开时出现
            （用户要的正是这个：收起态的卡片是一行摘要，不该顶着三个操作按钮）。
            绝对定位，参照物是卡片本身（上面 root 那个 relative），落在右上角。
          */}
          <CardControls className="right-1 top-1" />

          <Textarea
            value={note}
            rows={2}
            placeholder="在此添加笔记、链接等"
            className="min-h-[44px] text-sm resize-none border-gray-200 bg-white focus-visible:ring-0"
            onFocus={() => (noteFocusedRef.current = true)}
            onBlur={() => {
              noteFocusedRef.current = false;
              commitNote();
            }}
            onChange={(e) => setNote(e.target.value)}
          />

          {/* 操作行 */}
          <div className="flex items-center gap-1">
            <VisitedButton
              visited={visited}
              onToggle={toggleVisited}
              size="sm"
              className="mr-1"
            />
            <TimeButton
              from={item.timeFrom}
              to={item.timeTo}
              onSave={(from, to) =>
                updateItem(item.id, { timeFrom: from, timeTo: to })
              }
            />
            <AttachmentButton
              url={item.url}
              onSave={(url) => updateItem(item.id, { url })}
            />
            {/*
              有费用就把它本身显示出来（蓝框 + 金额），没有才是「添加费用」。
              以前无论有没有都写死「添加费用」，于是从预算里给这个地点记过账之后，
              卡片上仍然什么都没有 —— 看着像没记上。

              金额是费用表的视图，不在卡上另存；两个弹窗也归它自己管，见
              LinkedExpenseButton。航班卡、住宿卡上那一格是同一个组件。
            */}
            <LinkedExpenseButton
              linkedItemType="place"
              linkedItemId={item.id}
              // 类别按地点默认「门票」，日期落在这一天，用户只需填个金额
              prefill={{ name: item.name, category: "门票", date: item.dayDate ?? "" }}
            />
          </div>
        </div>
      )}

    </div>
  );
}

/**
 * 酒店那一行小字。
 *
 * 住宿在当天列表里是 hotels 表那一行的**投影**：它只表明"这天从哪儿出发、晚上回哪儿睡"，
 * 顺带给前后两张卡撑出一段可导航的间隔。所以它是纯展示的 —— 不能点、不能删、不能编辑，
 * 身上不产生任何用户数据（要改住宿信息去概览的 Hotels 里改，要改"住哪几天"也是改酒店日期；
 * 删除同理，见 place-kinds 的 canDeletePlace）。
 *
 * 删不掉 + 编辑不了，合起来意味着将来改酒店日期时可以放心把这几行删了重建。
 *
 * 但底层仍是一份 place_items 行，**不能**改成纯渲染出来的东西：坐标（地图 marker）、
 * 路线端点（PlaceDayGap 两端都要 lng/lat）、段间交通方式（route_mode_to_next 存在
 * 起点那张 item 上）全都挂在它身上。
 */
function HotelLine({ item }: { item: PlaceItem }) {
  return (
    // pl-2：因为没有边框所以向左推。比 PlaceDayGap 的 left-8 再靠左一点 ——
    // 那行有图标和按钮要摆，这行只有名字，让它挂在线上更像"从这条线上长出来的"
    <div className="flex items-center py-1 pl-2 text-xs text-gray-400">
      <span
        className={cn(
          "truncate",
          // 已访问的划线仍要显示（那是从详情卡设的），只是这一行本身不给开关
          item.visited && "line-through decoration-gray-300",
        )}
      >
        {item.name}
      </span>
    </div>
  );
}

/* ====================================================================
 * Portal 弹层：固定定位到按钮正下方并渲染到 body（data-inline-pop 供外点收起识别）
 * ==================================================================== */
function PopoverLayer({
  anchorEl,
  onClose,
  width,
  children,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  width: number;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!anchorEl) return;
    const update = () => {
      const r = anchorEl.getBoundingClientRect();
      setPos({
        top: r.bottom + 6,
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      });
    };
    update();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
  }, [anchorEl, width]);

  if (!pos) return null;

  return createPortal(
    <>
      {/* 点击空白处关闭 */}
      <div
        data-inline-pop
        className="fixed inset-0 z-[200]"
        onClick={onClose}
      />
      <div
        data-inline-pop
        className="fixed z-[210] rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
        style={{ top: pos.top, left: pos.left, width }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

/* ---------- 时间：小窗设置起/止 ---------- */
function TimeButton({
  from,
  to,
  onSave,
}: {
  from: string | null;
  to: string | null;
  onSave: (from: string | null, to: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from ?? "");
  const [draftTo, setDraftTo] = useState(to ?? "");
  const anchorRef = useRef<HTMLDivElement>(null);

  const openEditor = () => {
    setDraftFrom(from ?? "");
    setDraftTo(to ?? "");
    setOpen(true);
  };

  const save = () => {
    onSave(draftFrom || null, draftTo || null);
    setOpen(false);
  };

  return (
    <div className="relative" ref={anchorRef}>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "h-7 px-2 text-xs gap-1 text-gray-600",
          from && to && "border-emerald-300 text-emerald-700",
        )}
        onClick={openEditor}
      >
        <Clock className="h-3.5 w-3.5" />
        {from && to ? `${from} - ${to}` : "添加时间"}
      </Button>

      {open && (
        <PopoverLayer
          anchorEl={anchorRef.current}
          onClose={() => setOpen(false)}
          width={256}
        >
          <p className="mb-2 text-xs text-gray-400">设置起止时间</p>
          <div className="flex items-center gap-2">
            <Label htmlFor="place-time-from" className="sr-only">
              开始时间
            </Label>
            <Input
              id="place-time-from"
              type="time"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="h-8 text-sm"
            />
            <span className="text-xs text-gray-400">至</span>
            <Label htmlFor="place-time-to" className="sr-only">
              结束时间
            </Label>
            <Input
              id="place-time-to"
              type="time"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="mt-2 flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-orange-500 hover:bg-orange-600"
              onClick={save}
            >
              保存
            </Button>
          </div>
        </PopoverLayer>
      )}
    </div>
  );
}

/* ---------- 附件：粘贴链接 ---------- */
function AttachmentButton({
  url,
  onSave,
}: {
  url: string | null;
  onSave: (url: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(url ?? "");
  const anchorRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    setDraft(url ?? "");
    setOpen((v) => !v);
  };

  const save = () => {
    onSave(draft.trim() ? draft.trim() : null);
    setOpen(false);
  };

  return (
    <div className="relative" ref={anchorRef}>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "h-7 px-2 text-xs gap-1 text-gray-600",
          url && "border-emerald-300 text-emerald-700",
        )}
        onClick={toggle}
      >
        {url ? (
          <LinkIcon className="h-3.5 w-3.5" />
        ) : (
          <Paperclip className="h-3.5 w-3.5" />
        )}
        {url ? "已添加附件" : "附件"}
      </Button>

      {open && (
        <PopoverLayer
          anchorEl={anchorRef.current}
          onClose={() => setOpen(false)}
          width={288}
        >
          <p className="mb-2 text-xs text-gray-400">粘贴链接</p>
          <Input
            value={draft}
            placeholder="https://…"
            className="h-8 text-sm"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
          <div className="mt-2 flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-orange-500 hover:bg-orange-600"
              onClick={save}
            >
              保存
            </Button>
          </div>
        </PopoverLayer>
      )}
    </div>
  );
}
