"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useNotes } from "@/context/notes-context";
import ListShell from "./ListShell";

/**
 * 概览区的 Notes 列表。单个 textarea，失焦自动保存。
 *
 * 内容存在 NotesProvider 里（撤销栈要够得到它），组件只攥着一份**草稿**。
 * 草稿的写法照抄 PlaceCard 那一套，两个 ref 各管一件事：
 *  - `focusedRef`：正在输入时不要被外部值（撤销还原、别处的保存）打断；
 *  - `lastSavedRef`：内容没变就不提交 —— 每次失焦都写一遍的话，按新规矩每次写
 *    都是一条历史记录，撤销按钮会堆出一串"什么都没变"的步骤。
 */
export default function NotesList() {
  const { notes, saveContent } = useNotes();

  const [expanded, setExpanded] = useState(true);
  const [content, setContent] = useState(notes[0]?.content ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const focusedRef = useRef(false);
  // 始终是最新草稿的 ref（失焦那一刻也能拿到输入中的内容）
  const contentRef = useRef(content);
  contentRef.current = content;
  // 最近一次已提交的内容，避免重复提交
  const lastSavedRef = useRef(notes[0]?.content ?? "");

  // 源头那行变了（撤销还原、别处保存）就同步回草稿；正在输入时不打断
  useEffect(() => {
    if (focusedRef.current) return;
    const next = notes[0]?.content ?? "";
    setContent(next);
    lastSavedRef.current = next;
  }, [notes]);

  const handleBlur = () => {
    focusedRef.current = false;
    const next = contentRef.current;
    if (next === lastSavedRef.current) return;
    lastSavedRef.current = next;
    setIsSaving(true);
    void saveContent(next).finally(() => setIsSaving(false));
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /*
   * 输入框高度跟着内容长，长到上限就封顶、里面出滚动条。
   *
   * **上限只写在 className 的 max-h-60（240px，十来行）上，这里只负责"内容有多高"** —— 两处各写
   * 一个上限迟早会对不上，而 CSS 那个是真的把框卡住的（内联 height 写得再大也越不过
   * max-height），所以封顶交给它。
   *
   * 为什么用 useLayoutEffect 而不是在 onInput 里改高度：那样只有"打字"这一条路会重算
   * 高度，撤销还原、切回收起的列表都得各写一遍；盯住 content 就自动全覆盖了。用 layout
   * 版是因为它在浏览器绘制前跑完，不会先闪一下旧高度再变。
   *
   * **先把 height 归零再量**是必须的：不归零的话 box 还是上一次那个高度，缩短内容时
   * scrollHeight 量到的仍是被撑开的高度 —— 框就只会长、不会缩。
   *
   * `+ borders` 也是必须的，少了它滚轮会**长驻**：scrollHeight 量的是"含内边距、不含
   * 边框"的高度，而 Tailwind 全站是 border-box（height 含边框）。直接把 scrollHeight 写
   * 回 height，上下两条 1px 边框就挤掉了那 2px，于是任何内容下都差一点点、都被判成"有
   * 内容溢出"，`overflow-y: auto` 就把滚轮画出来了 —— 看着就是矮框旁边也杵着一根。
   * 补上这段边框差，框才刚好装下内容，滚轮只在真的顶到 max-h 时才出现。
   *
   * 依赖里的 expanded 不是多余的：ListShell 收起时会真的把 children 卸掉（见它那句
   * `{expanded && ...}`），重新展开拿到的是**新**的 textarea 节点、内联高度是空的，
   * 只有 expanded 变了才会再跑一次这个 effect 把高度补上。节点不在时直接返回：
   * 收起的那次 effect 跑在 ref 已经摘掉之后。
   */
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const borders = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + borders}px`;
  }, [content, expanded]);

  return (
    <ListShell
      anchorId="list-notes"
      title="Notes"
      expanded={expanded}
      onExpandedChange={setExpanded}
    >
      {/*
        这里以前还套着一层 <div className="p-4">，于是输入框比同一个白容器里其它列表的
        内容窄 32px —— ListShell 已经给了 px-6 pl-14 pb-5，那层是重复的。去掉之后左右沿
        跟航班/住宿/地点卡完全对齐（用户看到的"notes 框子和 flights 宽度不一致"就是它）。

        bg-gray-50：跟那些卡一个底。Textarea 基类自带 bg-transparent，在这儿等于白，
        混在一页里就是"别的卡浅灰、notes 纯白"两种底色。边框留着 —— 航班卡 border-0 是
        因为它整块都能点开，而这是个真输入框，得看得出能打字。
      */}
      <Textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={handleBlur}
        placeholder="在此处撰写或粘贴任何内容：如何出行，提示和技巧"
        // 下限（min-h）和上限（max-h）都在这儿，中间那段高度由上面那个 layout effect 量。
        //
        // text-base md:text-base 看着重复，两个都不能少：Textarea 基类是
        // `text-base md:text-sm`，desktop 上真正生效的是那个 md:text-sm（14px），
        // 光写 text-base 会被它盖掉 —— 要 16px 就得把 md 那一档也点出来。
        className="min-h-14 max-h-60 resize-none overflow-y-auto border-gray-200 bg-gray-50 text-base md:text-base focus-visible:border-orange-300"
        rows={2}
        style={{
          /*
           * fieldSizing: "fixed" 必须有。shadcn 的 Textarea 自带 field-sizing-content
           * （"框跟着内容长"），而那条规则管**宽高两个方向** —— 打一行长文字时它会一直
           * 变宽、永不折行，而 textarea 在布局上算替换元素（min-content 就等于内在
           * 宽度），这个宽度会一路顶到外层那个 flex 列上，把整个详情列连同地图那列
           * 往右挤。给它 w-full 也拦不住：算内在尺寸时百分比宽度等于 auto，仍然回落到
           * 内在宽度。
           *
           * 关掉之后高度就不归 CSS 管了，改由上面那个 layout effect 按内容量 —— 那也
           * 正合适：宽度要的是"永远铺满"，高度要的是"跟着内容、到顶就滚"。
           * 写成内联样式而不是再加个 field-sizing-fixed 类：两个类设的是同一个属性、
           * 优先级一样，谁赢只看 Tailwind 生成的先后，太脆；内联样式一定压得住。
           */
          fieldSizing: "fixed",
        }}
      />
      {isSaving && <p className="text-xs text-gray-400 mt-2">保存中...</p>}
    </ListShell>
  );
}
