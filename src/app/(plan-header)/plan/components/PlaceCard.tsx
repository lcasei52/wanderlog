"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  Clock,
  Link as LinkIcon,
  Paperclip,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PlaceItem } from "@/types/place";
import { usePlaces } from "@/context/places-context";
import { cn } from "@/lib/utils";
import VisitedButton, { visitedToggleFeedback } from "./VisitedButton";
import PlaceKindBadge from "./PlaceKindBadge";

/** 已访问 mini marker 的固定灰色（与地图一致） */
const VISITED_SLATE = "#94a3b8";

/**
 * 地点卡：可嵌入任何地点列表 / DayCard 容器。
 * 收起态 = 灰底圆角框 + 最左容器色 mini marker（序号与地图一致）+ 名称/详情/备注；
 * 点击展开就地编辑（笔记/时间/附件/费用占位），同时保持原有动作：地图聚焦 + 打开 PlaceDetailCard；
 * 展开后点卡片外部自动收起。时间/附件弹层用 Portal 渲染到 body，避免被外层容器裁切。
 * 拖动排序 / 删除由外层 SortableCardGroup 提供（手柄与垃圾桶浮在卡片外面的左右两侧）。
 */
export default function PlaceCard({ item }: { item: PlaceItem }) {
  const { selectItem, itemNumber, itemColor, updateItem } = usePlaces();

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
          "[data-inline-pop],[role='dialog'],[data-sonner-toaster]"
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
        "rounded-lg bg-gray-100 px-3 py-2",
        expanded ? "" : "hover:bg-gray-50 cursor-pointer",
      )}
    >
      {/* 收起/展开 头部行 */}
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
        className="flex items-start gap-2 cursor-pointer group"
      >
        {/* mini marker：手动地点 = 容器色 + 序号；机场/酒店 = 淡色底 + 图标（与地图一致） */}
        <PlaceKindBadge
          item={item}
          number={number}
          color={containerColor}
          className="mt-0.5"
        />

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm text-gray-800 leading-snug truncate",
              visited && "line-through decoration-gray-300",
            )}
          >
            {item.name}
          </p>
          {noteText && (
            <p className="text-xs text-gray-500 leading-snug line-clamp-2 wrap-break-word whitespace-pre-wrap">
              {noteText}
            </p>
          )}
          {(detailLine || timeText || item.url) && (
            <p className="text-xs text-gray-400 truncate">
              {[detailLine, timeText, item.url].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* 展开箭头 */}
        <ChevronRight
          className={cn(
            "h-4 w-4 mt-0.5 text-gray-300 shrink-0 transition-transform",
            expanded && "rotate-90",
          )}
        />

      </div>

      {/* 展开：就地编辑 */}
      {expanded && (
        <div className="mt-2 pl-7 space-y-2">
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
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-gray-600"
              onClick={() =>
                toast.info("添加费用", {
                  description: "费用功能后续完善",
                })
              }
            >
              <Wallet className="h-3.5 w-3.5" />
              添加费用
            </Button>
          </div>
        </div>
      )}
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
