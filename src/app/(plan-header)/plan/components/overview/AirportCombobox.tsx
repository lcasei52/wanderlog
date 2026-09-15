"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface ComboOption {
  /** 选中后写进输入框的文本，同时兼作 key */
  value: string;
  /** 主行 */
  label: string;
  /** 右侧灰色次要信息（如「北京 · PEK」） */
  hint?: string;
}

/**
 * 可搜索、且**允许自由输入**的下拉框。
 *
 * 用 Input 当 PopoverAnchor 而不是 PopoverTrigger：机场/城市要能手打
 * （表外的小机场、境外航段），所以输入框必须始终可编辑，下拉只是加速器。
 *
 * 两件事自己做，因为搜索词在外部 Input 里、焦点也一直在那儿：
 * - 过滤：Command 传 shouldFilter={false}，cmdk 只当渲染器用；
 * - 上下键与回车：在 Input 的 onKeyDown 里按本地 active 下标走。
 */
export default function AirportCombobox({
  value,
  onChange,
  onPick,
  options,
  placeholder,
  emptyText = "没有匹配项，直接输入即可",
  disabled,
  heading,
}: {
  value: string;
  /** 自由输入：只改文本，不动三字码 */
  onChange: (next: string) => void;
  /** 从下拉里选中：调用方负责回填城市 / 机场名 / 三字码 */
  onPick: (option: ComboOption) => void;
  options: ComboOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** 候选列表上的一行小标题，用来说明这批候选是哪来的 */
  heading?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)
    );
  }, [value, options]);

  // 候选变了就把高亮拉回第一条，否则会停在一个已经不存在的下标上
  useEffect(() => setActive(0), [value]);

  // 高亮跟着键盘走时，把它滚进可视区
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (o: ComboOption) => {
    onPick(o);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // 选完后面板关掉、焦点还在这一格，此时再点一下不会触发 focus，
          // 得靠 click 把它重新叫出来
          onClick={() => setOpen(true)}
          onBlur={(e) => {
            // 焦点真的离开这一格才关。点面板里的东西走不到这儿（面板拦了
            // mousedown，焦点压根没动），所以这条等价于"人点到别处去了"。
            if (
              e.relatedTarget instanceof Node &&
              contentRef.current?.contains(e.relatedTarget)
            ) {
              return;
            }
            setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (!open || filtered.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(filtered[active]);
            }
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef}
        align="start"
        // 宽度跟着输入框；拿不到锚点宽度时退回 18rem
        className="w-[var(--radix-popover-trigger-width,18rem)] p-0"
        // 别让 Radix 把焦点从输入框抢走，否则打一个字就断
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        /*
         * 关闭时机完全自己判断（选中 / Esc / 输入框失焦），Radix 那套
         * "点到或焦点落到面板外就关"整个关掉。
         *
         * 原因在 react-dismissable-layer 的 useFocusOutside：它派发 FOCUS_OUTSIDE
         * 的条件是 `!isFocusInsideReactTreeRef.current`，而这个 ref 只由面板自己的
         * onFocusCapture 置真 —— 我们的输入框在面板外面、焦点按设计从不进面板，
         * 于是它永远为假，之后随便一次 focusin 都会被当成"跑到外面了"，
         * 面板刚开就被收掉（一闪而过）。
         */
        onInteractOutside={(e) => e.preventDefault()}
      >
        <Command
          shouldFilter={false}
          // 面板里按下任何地方都别让输入框失焦 —— 点选项、拖滚动条、点空白都算。
          // 焦点一动不动，上面那条 onBlur 才等价于"人点到别处去了"。
          // click 不受影响（它不是 mousedown 的默认行为），选项照样点得中。
          onMouseDown={(e) => e.preventDefault()}
        >
          <CommandList ref={listRef} className="max-h-56">
            {filtered.length === 0 ? (
              <CommandEmpty>{emptyText}</CommandEmpty>
            ) : (
              <CommandGroup heading={heading}>
                {filtered.map((o, i) => (
                  <CommandItem
                    key={o.value}
                    value={o.value}
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onSelect={() => pick(o)}
                    className={cn(
                      "gap-2",
                      i === active && "bg-accent text-accent-foreground"
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    {o.hint && (
                      <span className="ml-auto shrink-0 text-xs text-gray-400">
                        {o.hint}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
