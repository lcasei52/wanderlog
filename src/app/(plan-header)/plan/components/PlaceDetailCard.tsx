"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  ImagePlus,
  Layers,
  Loader2,
  MapPin,
  MapPinned,
  Pencil,
  Phone,
  Sparkles,
  Star,
  Tag,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import ImagePickerDialog, {
  MAX_LOCAL_IMAGE_BYTES,
} from "@/components/ImagePickerDialog";
import type { PlaceContainer, PlaceItem } from "@/types/place";
import { usePlaces } from "@/context/places-context";
import { useHistory } from "@/context/history-context";
import { usePlaceFacts, type PlaceFacts } from "@/hooks/usePlaceFacts";
import { callAi, readAiConfig } from "@/lib/ai-providers";
import VisitedButton, { visitedToggleFeedback } from "./VisitedButton";
import PlaceKindBadge from "./PlaceKindBadge";
import { cn } from "@/lib/utils";

interface PlaceDetailCardProps {
  /** 缩放至某地点（由 MapView 注入；实现会把该点放到上半屏） */
  zoomToPlace?: (position: [number, number], zoom?: number) => void;
}

/** 两实例是否同属一个容器 */
function inContainer(item: PlaceItem, container: PlaceContainer): boolean {
  return container.kind === "list"
    ? item.listId === container.listId
    : item.dayDate === container.dayDate;
}

/**
 * 把已知信息拼成给模型的一段话。有 AMap 的评分/营业时间就一起给 ——
 * 模型知道"这是个人均 85、晚上十点关门的地方"，写出来的介绍会具体得多。
 */
function buildPlacePrompt(cur: PlaceItem, facts: PlaceFacts | null): string {
  const lines = [`名称：${cur.name}`];
  if (cur.address) lines.push(`地址：${cur.address}`);
  if (cur.type) lines.push(`分类：${cur.type}`);
  const region = [facts?.province, facts?.city, facts?.district]
    .filter(Boolean)
    .join("");
  if (region) lines.push(`所在：${region}`);
  if (facts?.businessArea) lines.push(`商圈：${facts.businessArea}`);
  if (facts?.rating) lines.push(`评分：${facts.rating}`);
  if (facts?.cost) lines.push(`人均：${facts.cost}`);
  if (facts?.openTime) lines.push(`营业时间：${facts.openTime}`);
  return lines.join("\n");
}

/**
 * 浮在地图列底部的"地点详情"卡：展示当前选中的一份地点实例，
 * 顶部工具条 = 「N个中的第M个」前后切换 + 缩放至此地点；
 * 正文（左）= 详情/简介 + 已访问开关 + 「属于哪些图层」下拉
 * （勾选=复制一份过去、取消=删除该图层那份）；右侧 = 图片（可点开大图、可更换）。
 */
export default function PlaceDetailCard({ zoomToPlace }: PlaceDetailCardProps) {
  const { item, selectedItemId } = usePlaces();
  const cur = selectedItemId ? item(selectedItemId) : null;
  if (!cur) return null;

  // key 换一个地点就整块重挂载：大图、换图弹窗、简介编辑这些"半途状态"跟着归零。
  // 否则"正在编辑简介时点了下一个地点"，上一处的草稿会带到下一处去
  return <DetailBody key={cur.id} cur={cur} zoomToPlace={zoomToPlace} />;
}

function DetailBody({
  cur,
  zoomToPlace,
}: {
  cur: PlaceItem;
  zoomToPlace?: (position: [number, number], zoom?: number) => void;
}) {
  const {
    placeLists,
    days,
    peers,
    itemsInContainer,
    containerOf,
    itemNumber,
    itemColor,
    listColor,
    dayColor,
    containerTitle,
    selectItem,
    clearSelection,
    copyItemTo,
    deleteItem,
    updateItem,
  } = usePlaces();
  const { batch, restoreNonce } = useHistory();

  // 大图 / 换图弹窗 / 简介编辑
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  // 保存后先本地显示新内容，等服务器那份绕回来再让位。不这么做的话，
  // 「保存 → 切回只读」到 revalidate 回来之间会闪一下旧文字
  const [optimisticDesc, setOptimisticDesc] = useState<
    string | null | undefined
  >(undefined);
  // AI 配置存在 localStorage，只能挂载后读 —— 渲染期间读会和服务端输出对不上
  const [aiConfig, setAiConfig] = useState<ReturnType<typeof readAiConfig>>(null);

  const { facts } = usePlaceFacts(cur);

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    setAiConfig(readAiConfig());
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  /*
   * 乐观值只活到"源头那行开口"为止，判据有两条：
   *   1. 服务器那份绕回来了（cur.description 追上了我们写进去的值）—— 让位给它；
   *   2. 这中间发生过撤销/复原 —— 用户要看的是快照里那个值，不是我们手上这个。
   * 少了第 2 条，撤销把简介改成别的值时乐观值会一直挂着盖住快照的值（看着就像
   * "撤销没生效"，而再点一次保存还会把它写回库）。
   */
  const restoreNonceRef = useRef(restoreNonce);
  useEffect(() => {
    const restored = restoreNonceRef.current !== restoreNonce;
    restoreNonceRef.current = restoreNonce;
    if (optimisticDesc === undefined) return;
    if (restored || cur.description === optimisticDesc) {
      setOptimisticDesc(undefined);
    }
  }, [cur.description, optimisticDesc, restoreNonce]);

  const shownDesc =
    optimisticDesc !== undefined ? optimisticDesc : cur.description;

  // 当前容器内的全部实例（按行序 1..N），用于"第 M 个 / 共 N 个"前后切换
  const containerItems = itemsInContainer(containerOf(cur));
  const curIndex = containerItems.findIndex((it) => it.id === cur.id);
  const total = containerItems.length;
  const showNav = total > 1;
  const prevItem = curIndex > 0 ? containerItems[curIndex - 1] : null;
  const nextItem = curIndex < total - 1 ? containerItems[curIndex + 1] : null;

  const myPeers = peers(cur);

  const layerOptions: {
    key: string;
    label: string;
    color: string;
    container: PlaceContainer;
    present: boolean;
  }[] = [
    ...placeLists.map((l) => ({
      key: `list:${l.id}`,
      label: l.title,
      color: listColor(l.id),
      container: { kind: "list", listId: l.id } as PlaceContainer,
      present: myPeers.some((p) => p.listId === l.id),
    })),
    ...days.map((d) => ({
      key: `day:${d.dayDate}`,
      label: `Day ${d.dayNumber} · ${d.label}`,
      color: dayColor(d.dayDate),
      container: { kind: "day", dayDate: d.dayDate } as PlaceContainer,
      present: myPeers.some((p) => p.dayDate === d.dayDate),
    })),
  ];

  const presentTitles = layerOptions.filter((o) => o.present).map((o) => o.label);

  /**
   * 勾选/取消勾选一个图层。勾选是复制一份、取消是删掉该图层下的**全部**同 POI 实例
   * （可能是好几份），在用户眼里都只是"点了一下这个勾"，所以整段包进 batch：
   * 一次撤销即回到点击之前，而不是按 N 下才把那一批副本逐个收回去。
   */
  const applyLayer = async (container: PlaceContainer, checked: boolean) => {
    await batch(async () => {
      if (checked) {
        // 勾选新图层 = 复制一份实例过去（含笔记/时间/附件/已访问，同 #4）
        const copied = await copyItemTo(cur.id, container);
        if (copied) {
          toast.success(`已复制到「${containerTitle(container)}」`);
        }
        return;
      }
      // 取消勾选 = 删掉该图层下的全部同 POI 实例
      const removing = myPeers.filter((p) => inContainer(p, container));
      for (const p of removing) {
        await deleteItem(p.id);
      }
      if (removing.some((p) => p.id === cur.id)) {
        const survivor = myPeers.find(
          (p) => !removing.some((r) => r.id === p.id)
        );
        if (survivor) {
          toast.info("已移除，切换到同一地点的另一份实例");
          selectItem(survivor.id);
        } else {
          toast.success("已移除");
          clearSelection();
        }
      } else {
        toast.success("已移除");
      }
    });
  };

  const toggleVisited = () => {
    const wasVisited = cur.visited;
    updateItem(cur.id, { visited: !wasVisited });
    visitedToggleFeedback(wasVisited);
  };

  const infoRows: { icon: React.ReactNode; text: string }[] = [];
  if (cur.address)
    infoRows.push({ icon: <MapPin className="h-4 w-4" />, text: cur.address });
  if (cur.tel) infoRows.push({ icon: <Phone className="h-4 w-4" />, text: cur.tel });
  if (cur.type) infoRows.push({ icon: <Tag className="h-4 w-4" />, text: cur.type });

  // AMap 补充信息。每一项都"有才渲染" —— 没配 AMAP_WEB_KEY 时评分/人均/营业时间
  // 整块不出现，不会留一排空壳
  const factRows: { icon: React.ReactNode; label: string; value: string }[] = [];
  const region = [facts?.province, facts?.city, facts?.district]
    .filter(Boolean)
    .join("");
  if (region)
    factRows.push({
      icon: <MapPinned className="h-4 w-4" />,
      label: "所在",
      value: region,
    });
  if (facts?.businessArea)
    factRows.push({
      icon: <Building2 className="h-4 w-4" />,
      label: "商圈",
      value: facts.businessArea,
    });
  if (facts?.rating)
    factRows.push({ icon: <Star className="h-4 w-4" />, label: "评分", value: facts.rating });
  if (facts?.cost)
    factRows.push({ icon: <Wallet className="h-4 w-4" />, label: "人均", value: `¥${facts.cost}` });
  if (facts?.openTime)
    factRows.push({
      icon: <Clock className="h-4 w-4" />,
      label: "营业时间",
      value: facts.openTime,
    });

  // AMap 给的其余照片（封面那张不重复列）
  const otherPhotos = (facts?.photos ?? []).filter((p) => p !== cur.photo);

  const number = itemNumber(cur);
  const color = cur.visited ? "#94a3b8" : itemColor(cur);

  // —— 换图 ——
  // 网络图给 url、本地图给 data，最终都进 photo 这一列（updatePlaceItem 会写它）
  const handlePhotoSelect = ({ url, data }: { url?: string; data?: string }) => {
    updateItem(cur.id, { photo: url ?? data ?? null });
    toast.success("图片已更新");
  };

  // —— 简介 ——
  const startEditDesc = () => {
    setDescDraft(shownDesc ?? "");
    setEditingDesc(true);
  };

  const saveDescription = () => {
    const next = descDraft.trim() || null;
    setOptimisticDesc(next);
    setEditingDesc(false);
    void updateItem(cur.id, { description: next });
  };

  const generateDescription = async () => {
    const cfg = readAiConfig();
    if (!cfg) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    try {
      const reply = await callAi({
        provider: cfg.provider,
        model: cfg.model,
        apiKey: cfg.apiKey,
        signal: controller.signal,
        system:
          "你是旅行资料编辑。用中文客观介绍用户给出的地点，2-3 句说清它是什么、有什么看点。" +
          "不要罗列条款，不要用 Markdown 标记，不要编造你不确定的事实。",
        messages: [{ role: "user", content: buildPlacePrompt(cur, facts) }],
      });
      // 生成的东西先让人过一眼：填进编辑框，点「保存」才落库。
      // 这样"可编辑"这条语义才是连贯的 —— 生成和手写走的是同一条路
      setDescDraft(reply);
      setEditingDesc(true);
    } catch (err) {
      // abort 是切换地点/卸载导致的，不是错误
      if ((err as Error)?.name !== "AbortError") {
        toast.error(err instanceof Error ? err.message : "生成失败，请重试");
      }
    } finally {
      setGenerating(false);
    }
  };

  const navBtn =
    "h-7 px-2 gap-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent";

  /*
   * ★ 卡片里的排版按**容器**宽度断，不按视口宽度 —— 这是这张卡最反直觉的一处。
   *
   * 地图列有多宽，跟窗口多宽根本不是一回事：左边那一列（SimpleSidebar +
   * DetailContent）是 `flex: 0 1 auto`，宽度由**内容**撑着，地图列是 `flex-1`，
   * 只能吃剩下的。于是 1024px 的窗口留给地图的只有 200 出头（这也正是"左列约 800"
   * 这个数的反推来源），1280 上约 448，1440 上才 600 出头。
   *
   * 而卡右边那张图原来写的是 `w-40 sm:w-56`：sm 断的是**视口** 640px，1024 的窗口
   * 早就过了，于是图钉死在 224px —— 160(卡内宽) − 224(图) − 16(gap) 是个负数，
   * 文字列被压没，一个汉字一行地竖着排下来（用户报的"内容被挤坏了、文字变成竖着的"）。
   *
   * 所以这里换成 @container：量的是"这张卡到底有多少地方"。容器挂在下面那层
   * flex 列上，宽度 = 地图列扣掉左右各 16px（px-4）—— 特意选它是因为它**自己不带
   * padding**：容器查询量的是内容盒，挂在带 padding 的元素上还得在心里把那圈扣掉。
   * 卡片自己还有 p-4，所以文字列真正能用的是：容器宽 − 32 − 图宽 − 16(gap)。
   *
   * 图的四档（容器宽，加 32 就是地图列宽）：
   *   < 288    单列：图通栏、文字整宽，再窄也竖不起来
   *   ≥ 288    两列，图 128，文字 ≥ 112
   *   ≥ 320    两列，图 160 ← **375/390 手机上原本就是这个数，一个像素没动**
   *   ≥ 512    两列，图 224 ← 桌面原本的 sm:w-56，同样保持原样
   * 一句话：小屏和宽屏的观感都是原样，改掉的只有 1024~1200 那段原来被挤坏的区域。
   *
   * ★ 同一个病在卡里还有两处，都按**同一个容器**断，三处合起来才是"文字不竖着排"
   *   这件事的全部 —— 光缩图是不够的：
   *     · 工具条上「3个中的第1个」「缩放至此地点」两个标签（窄了收成图标）
   *     · 标题行里那个 126px 的「标记为已访问」（窄了让它换行，把整行让给地名）
   *
   * ★ 单列那档必须把 `col-span-2` 一起摘掉（写成 @2xs:col-span-2）：网格只有一列时
   *   挂着 span 2，浏览器会为了装下它**凭空长出第二条隐式列**，第一列当场被挤窄 ——
   *   比不修还糟。
   */
  return (
    <div className="absolute inset-0 z-20 flex px-4 pb-4 overflow-hidden pointer-events-none">
      {/* h-full：让内层占满地图列高度，卡片的 max-h-[55%] 才有确定参照系，
          内容超高时在正文里滚动而不是撑破/裁掉

          @container 挂在这一层：工具条和卡片都住在它里面，一套断点管两处；
          挑它而不是卡片本身，是因为它不带内边距（理由见上面那段 ★）。 */}
      <div className="@container flex h-full w-full flex-col justify-end gap-2">
        {/*
          卡片上方这一行：左边导航工具条、右边关闭按钮，两者同一条水平线。

          容器窄的时候两个文字标签各自收掉、只留图标（下面那两处 hidden @2xs:inline /
          @xs:inline）：1024 那个宽度上地图列只有 224px，整条"3个中的第1个 ·
          缩放至此地点"是撑不下的，而按钮基类带 whitespace-nowrap、关闭按钮又是
          flex-shrink-0，硬撑的结果是关闭按钮被顶出这一行外（这一层 overflow-hidden，
          直接切掉）。阈值跟下面卡片那套是同一个容器，都在这层里量的。
        */}
        <div className="flex w-full items-center justify-between gap-2">
          {/* 工具条：前后切换 + 缩放至此地点 */}
          <div className="flex items-center rounded-full border border-gray-200 bg-white px-1.5 py-1 shadow-lg pointer-events-auto">
            {showNav ? (
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className={navBtn}
                  aria-label="上一个地点"
                  disabled={!prevItem}
                  onClick={() => prevItem && selectItem(prevItem.id)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {/* 窄容器只留前后两个箭头：这一串里就数它最占地方，而 ← → 本身
                    已经说明了"能前后翻"，那两个箭头挨着谁看都懂 */}
                <span className="hidden px-1 text-xs text-gray-600 whitespace-nowrap @2xs:inline">
                  {total}个中的第{curIndex + 1}个
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className={navBtn}
                  aria-label="下一个地点"
                  disabled={!nextItem}
                  onClick={() => nextItem && selectItem(nextItem.id)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="mx-1 h-4 w-px bg-gray-200" />
              </div>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className={cn(navBtn, "h-7")}
              aria-label="缩放至此地点"
              title="缩放至此地点（放到地图上半屏）"
              disabled={cur.lng == null || cur.lat == null || !zoomToPlace}
              onClick={() =>
                cur.lng != null && cur.lat != null && zoomToPlace?.([cur.lng, cur.lat])
              }
            >
              <Crosshair className="h-3.5 w-3.5" />
              {/* 窄容器里收成图标按钮，title/aria-label 都在，鼠标和读屏照样认得出 */}
              <span className="hidden @xs:inline">缩放至此地点</span>
            </Button>
          </div>

          {/* 关闭按钮：跟工具条同一条线，落在卡片右端 */}
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto h-8 w-8 flex-shrink-0 rounded-full shadow-lg"
            aria-label="关闭详情"
            onClick={clearSelection}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 单一容器：文字通栏排，图只是右上角一块圆角图，占住标题/地址那几行的留白。
            滚动也交给 Card 自己 —— 滚动条就落在卡片最右，不会卡在中间 */}
        <Card className="w-full pointer-events-auto shadow-2xl rounded-2xl p-4 gap-0 overflow-y-auto overflow-x-hidden max-h-[55%]">
          {/* 两列网格：左边文字，右边图；下面那些通栏的用 col-span-2。
              用网格而不是 float —— 环绕是"文字绕到图底下"，这里要的是
              "图就占住右上角那一块"，网格是确定的，不依赖行盒怎么算。

              ★ 窄容器（< @2xs）塌成**一列**：图通栏、文字整宽。那种宽度下两列无解 ——
              图再怎么缩也要占掉一半，文字只剩几十像素、一个汉字一行，单列是唯一的出路。

              ★ 下面那条 col-span-2 必须跟着断点走（@2xs:col-span-2），不能一直挂着：
              网格只有一列时 span 2 会凭空长出第二条**隐式**列，第一列当场被挤窄。 */}
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 @2xs:grid-cols-[minmax(0,1fr)_auto]">
            {/* 左上：标题 + 详情行 */}
            <div className="min-w-0 space-y-4">
              {/* 标题行 + 已访问开关。
                  ★ 换行只在**窄容器**里开（@max-md，容器 < 448）：「标记为已访问」是个
                  whitespace-nowrap + flex-shrink-0 的按钮（126px 上下），容器 192 时
                  整个文字列才 160，它一个就吃掉 126 + 12(gap)，留给地名的是 0 ——
                  又一个"文字竖着排"的来源。开成换行，地名先占满一整行，按钮落到下一行。

                  ★ 但不能一直开着：flex 的换行判据是各元素的 max-content（**不会**先
                  去挤），名字一长（max-content 超过文字列宽）就会在宽卡片上也把按钮
                  甩到第二行 —— 而宽卡片上原本的表现是"地名自己折成两行、按钮留在右边"，
                  那才是对的。所以这个 wrap 必须跟着容器宽度走，不能常开。 */}
              <div className="flex items-start justify-between gap-3 @max-md:flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {/* 机场/酒店自动生成的地点用来源图标，其余用容器色 + 序号 */}
                    <PlaceKindBadge item={cur} number={number} color={color} />
                    <h3 className="text-lg font-semibold text-gray-900 leading-snug wrap-break-word">
                      {cur.name}
                    </h3>
                  </div>
                  {myPeers.length > 1 && (
                    <p className="text-xs text-gray-400 mt-1">
                      同地点在 {myPeers.length} 个容器各有实例
                    </p>
                  )}
                </div>
                <VisitedButton
                  visited={cur.visited}
                  onToggle={toggleVisited}
                  className="flex-shrink-0"
                />
              </div>

              {/* 详细信息 */}
              {infoRows.length > 0 && (
                <div className="space-y-1.5 text-sm text-gray-600">
                  {infoRows.map((row, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-gray-400 flex-shrink-0 mt-0.5">
                        {row.icon}
                      </span>
                      <span className="wrap-break-word">{row.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 地点信息（高德补充字段） */}
              {factRows.length > 0 && (
                <div className="space-y-1.5 text-sm text-gray-600">
                  {factRows.map((row, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-gray-400 flex-shrink-0 mt-0.5">
                        {row.icon}
                      </span>
                      <span className="flex-shrink-0 text-gray-400">{row.label}</span>
                      <span className="wrap-break-word">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 右上：图。self-start 让它保持自己的比例、不被左边文字拉高；
                aspect 固定成 4:3，这样 object-cover 只裁一点边，
                不会像之前那个"竖长条"框一样把照片放大好几倍。

                ★ 宽度按**容器**分档，不再用 sm:（视口）—— 理由见上面 ★ 那段：
                1024 的窗口上地图列只有 224px，而 sm 断的 640 早就过了，图会钉在 224
                把文字挤没。四档里 288 和 320 那两档是给窄地图列用的，
                320 和 512 那两档**正好等于手机上原本的 w-40 和桌面上原本的 w-56**，
                也就是小屏/宽屏的观感原样不动。 */}
            <div
              className={cn(
                "group/photo relative aspect-4/3 w-full self-start overflow-hidden rounded-xl @2xs:w-32 @xs:w-40 @lg:w-56",
                cur.photo
                  ? "bg-gray-100"
                  : "bg-gradient-to-br from-orange-200 to-amber-100"
              )}
            >
              {cur.photo ? (
                <>
                  {/* AMap 图片域名，用原生 img 绕开 next/image 远程白名单 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cur.photo}
                    alt={cur.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute inset-0 cursor-zoom-in"
                    aria-label="查看大图"
                    onClick={() => setLightbox(cur.photo)}
                  />
                  {/*
                    触摸设备上常驻，桌面端 hover 才浮出来。

                    判断条件不能用 sm:（640px 宽度）去代理"桌面"：宽度和"有没有 hover"
                    是两回事，800px 的触屏平板过了 sm、又永远不 hover —— 那枚药丸就
                    永久隐形。pointer-fine 才是真条件（@media (pointer: fine)），
                    而且它是活的：iPad 接上触控板，这枚药丸立刻跟着回到 hover 那套。
                  */}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute bottom-1.5 left-1/2 z-10 h-7 -translate-x-1/2 gap-1 px-2 text-xs shadow-sm opacity-100 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/photo:opacity-100 pointer-fine:focus-visible:opacity-100"
                    onClick={() => setShowPicker(true)}
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    换图
                  </Button>
                </>
              ) : (
                // 没图时整块就是一个入口，免得"没有图 → 也没地方点"
                <button
                  type="button"
                  className="absolute inset-1.5 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-orange-300 text-orange-400/80 transition-colors hover:border-orange-400 hover:text-orange-500"
                  onClick={() => setShowPicker(true)}
                >
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-xs">选一张图</span>
                </button>
              )}
            </div>

            {/* 下面这些一律通栏（单列那档它就是普通的一行，见上面 ★） */}
            <div className="space-y-4 @2xs:col-span-2">
              {/* 高德给的其余照片，点开看大图 */}
              {otherPhotos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {otherPhotos.map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setLightbox(url)}
                      className="h-14 w-20 flex-shrink-0 overflow-hidden rounded-md border border-gray-200 cursor-zoom-in"
                      aria-label="查看大图"
                    >
                      {/* AMap 图片域名，用原生 img 绕开 next/image 远程白名单 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={cur.name}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* 简介：这个地方"是什么"（资料）。和 note 分工不同 ——
                  note 是"我要做什么"，显示在收起态的那张卡上 */}
              <div className="space-y-2">
                {/* 这一行是「简介」+ 两个按钮（生成简介 / 编辑），加起来一百八十多像素，
                    窄容器里撑不下就换行，别去挤标题。这里的 flex-wrap 可以常开：
                    三样都是固定宽度的小东西，装得下就绝不会换行（跟上面标题行不同，
                    那边有个会长到没边的地名，见那段 ★）。 */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-medium text-gray-700">简介</h4>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 gap-1 text-xs text-gray-500"
                      disabled={!aiConfig || generating}
                      title={
                        aiConfig
                          ? `用 ${aiConfig.provider.label} 生成`
                          : "先去 AI 助手配置厂商和 Key"
                      }
                      onClick={generateDescription}
                    >
                      {generating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {generating ? "生成中…" : "生成简介"}
                    </Button>
                    {!editingDesc && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 gap-1 text-xs text-gray-500"
                        onClick={startEditDesc}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </Button>
                    )}
                  </div>
                </div>

                {editingDesc ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={4}
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      placeholder="这是个什么样的地方…"
                      className="text-sm resize-none"
                    />
                    {/* 刻意不做"失焦自动保存"：简介是一段成文的资料，误触写库不值得 */}
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingDesc(false)}
                      >
                        取消
                      </Button>
                      <Button size="sm" onClick={saveDescription}>
                        保存
                      </Button>
                    </div>
                  </div>
                ) : shownDesc ? (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap wrap-break-word">
                    {shownDesc}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">还没有简介</p>
                )}
              </div>

              {/* 属于哪些图层 */}
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-gray-700"
                    >
                      <Layers className="h-4 w-4" />
                      属于哪些图层
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto">
                    <DropdownMenuLabel>
                      勾选让该地点也出现在其他图层（复制一份）
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {layerOptions.map((o) => (
                      <DropdownMenuCheckboxItem
                        key={o.key}
                        checked={o.present}
                        onCheckedChange={(checked) =>
                          applyLayer(o.container, Boolean(checked))
                        }
                        onSelect={(e) => e.preventDefault()}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="h-3.5 w-3.5 rounded-full inline-block flex-shrink-0"
                            style={{ backgroundColor: o.color }}
                          />
                          {o.label}
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {presentTitles.length > 0 && (
                  <p className="text-xs text-gray-500 flex-1 min-w-0">
                    出现在：{presentTitles.join("、")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 大图：近乎全屏，object-contain 保证不被裁。
          整块跟着 lightbox 走 —— 只切 open 的话，关闭动画那几百毫秒里内容还挂着，
          而 src 已经没值了，会往 img 里塞一个空串 */}
      {lightbox && (
        <Dialog open onOpenChange={(o) => !o && setLightbox(null)}>
          <DialogContent className="w-fit max-w-[92vw] border-0 bg-transparent p-2 shadow-none sm:max-w-[92vw]">
            {/* sr-only 的标题不能省：Radix 会因为没有标题报 a11y 警告 */}
            <DialogTitle className="sr-only">{cur.name}</DialogTitle>
            {/* AMap 图片域名，用原生 img 绕开 next/image 远程白名单 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox}
              alt={cur.name}
              className="h-auto max-h-[85vh] w-auto max-w-full rounded-lg object-contain"
            />
          </DialogContent>
        </Dialog>
      )}

      <ImagePickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        onSelect={handlePhotoSelect}
        searchQuery={cur.name}
        subject="地点图片"
        maxBytes={MAX_LOCAL_IMAGE_BYTES}
      />
    </div>
  );
}
