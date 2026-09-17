"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { Expense } from "@/types/expense";
import type { PlaceItem, PlaceListRow } from "@/types/place";
import type { Flight, Hotel, Note, Train } from "@/db/schema";
import { syncPlacesSnapshot } from "@/actions/places";
import { syncDayTitlesSnapshot } from "@/actions/days";
import { syncExpensesSnapshot } from "@/actions/expenses";
import { syncFlightsSnapshot } from "@/actions/flights";
import { syncHotelsSnapshot } from "@/actions/hotels";
import { syncTrainsSnapshot } from "@/actions/trains";
import { syncNotesSnapshot } from "@/actions/notes";
import { saveContainerColors } from "@/actions/trips";

/*
 * ============================================================
 * ★ 撤销契约 —— 要改行程数据之前，先把这段读完
 * ============================================================
 *
 * 全站只有这一个撤销栈，就在本文件里。一份快照按功能分片（见 TripSnapshot），
 * "谁在快照里"的唯一声明处是下面的 SNAPSHOT_FEATURES。
 *
 * 规矩一：**任何改了行程数据的动作，在它落地的那一刻就得登记** —— 要么动手**之前**
 * 调一次 push()，要么在上面那张"不进"清单里写明"不进、以及为什么"。两种都要登记，
 * 因为"忘了"和"有意不进"在代码里长得一模一样。
 *
 * 规矩二：**一次用户手势 = 一份快照**。几个动作合起来才是用户眼里的一个动作时
 * （加航班顺带挂机场地点、取消图层勾选要删好几份副本），把整段包进 batch()，
 * 期间只有第一份会被记下 —— 那一份取的是手势开始前的状态，所以撤销时整个手势
 * 一起退回去。别指望以后每个人记得给每个调用点传开关，组合手势用 batch 就对了。
 *
 * 规矩三：**push() 必须在第一个 await 之前调**。它取的是"上一次已提交渲染"的状态，
 * 动手之后状态就变了，那时记下来的是"改之后"的一份，撤销等于没退。
 *
 * 规矩四：mutator 在 await 回来后，如果这期间恢复过（restoreNonce 变了），**不要**
 * 再用服务端返回的行覆盖本地状态 —— 那一次的效果已经被撤销接管了。否则界面和库
 * 会各自描述一个从未存在过的状态。（典型场景：点撤销按钮时输入框先失焦，失焦保存
 * 和撤销挤在一起。）
 *
 * 规矩五：**组件不要把数据行拷进 useState 就完事**。想拿本地草稿（改名、编辑表单、
 * 乐观显示）可以，但必须在那行变化时从源头重新同步，否则撤销改了源、界面还显示旧值，
 * 其中几处还会把旧值原样写回库。两种写法已调好，照抄即可：
 *   - 输入框失焦才提交的（PlaceCard.note / NotesList）：`*FocusedRef` 挡住"正在输入
 *     时被打断"，`lastSavedRef` 挡住"内容没变也提交"（那会白白多一条历史记录）；
 *   - 有显式保存按钮的（FlightCard / HotelCard / ListShell 的标题）：源头的**值**变了
 *     才重置草稿（`sameFields` / 记住上一次的标题），**别**拿对象身份当判据 —— 拖动排序
 *     会为了写回 position 把整列的行对象重建一遍，身份变了字段却没变，照着重置会白擦
 *     用户还没保存的输入。也**别**在源头还没追上时就重置：改名不是乐观更新，等服务器
 *     回来的那一两秒里旧值还在，照着它重置会擦掉用户刚打的字。
 *   另外，把"当前在编辑哪一行"存成**行 id**、每次渲染现取那一行，而不是存那一行的
 *   对象（ExpensesList / DetailContent）：存对象的话，撤销换掉了源，对象身份却一直是
 *   旧的，下游组件的重置 effect 根本不会跑。
 *
 * 为什么必须当场记、不能"以后再补"：没记快照的改动**不会**安静地保持不变，它会被
 * 下一次撤销顺手带走一半。这就是 bookings 当初的处境 —— 删航班时服务端级联删掉了
 * 它自动生成的机场地点和记在上面的费用（本地靠 removeItemsBySource /
 * removeExpensesByLinkedItem 同步），但航班自己没进快照；此刻撤销上一个地点动作，
 * 还原的那份快照里**是带着**那些机场地点和费用的（它们在快照里），于是航班没回来、
 * 它的两个后果却回来了，一笔账挂在一张指向已删航班的卡上。
 * 这种错读代码看不出来，要用户点到才发现 —— 所以新加的动作必须当场登记。
 *
 * 进快照（谁动了谁改这里，另外记得同步改 SNAPSHOT_FEATURES / collect / syncAll）
 *   places     addItem / copyItemTo / deleteItem / updateItem / reorderItems
 *              / addPlaceList / reorderPlaceLists / renamePlaceList / deletePlaceList
 *              / setDayTitle（写 days.title，也就是 DayCard 里那行副标题）
 *              / setContainerColor（写 trips.container_colors，列表/某天的主色）
 *              （后两个都登记在这一片里，但它们**写的都不是 places 这张表**：
 *                副标题写 days，颜色写 trips。所以 sameSnapshot / syncAll 那两处
 *                也得跟着改，见它们各自的注释和 TripSnapshot 上那段）
 *   expenses   addExpense / updateExpense / deleteExpense / reorderExpenses
 *   bookings   addFlight / updateFlight / deleteFlight
 *              / addHotel / updateHotel / deleteHotel
 *              / addTrain / updateTrain / deleteTrain
 *              / reorderFlights / reorderHotels / reorderTrains
 *              （三张表装在同一片 bookings 里 —— 所以 sameSnapshot / syncAll
 *                那两处也得跟着改，见它们各自的注释）
 *   notes      saveContent（失焦保存；内容没变时不提交、也不记快照）
 *
 * 需要包 batch 的组合手势（否则一次点击会留下好几份快照，要按好几下才退回去）
 *   FlightsList.handleAddFlight / handleManualAdd   入库航班 + 挂出发/到达机场地点
 *   HotelsList.handleAddHotel                       入库住宿 + 跨天的一串酒店地点
 *   TrainsList.handleAddTrain / 手动填写那一条        入库火车 + 挂上车站/下车站两张站点卡
 *   PlacesList.handleGapAdd                         追加 + 重排（"插在这个间隔里"）
 *   DetailContent.insertListAt                      新增列表 + 整列重排（分隔线上那个 +）
 *   PlaceDetailCard.applyLayer                      取消勾选时循环删掉同 POI 的多份副本
 *
 * 不进快照 —— 有意
 *   places.removeItemsBySource           跟着删航班/住宿走；调用点已收进
 *   expenses.removeExpensesByLinkedItem  deleteFlight / deleteHotel 里，由那一处 push
 *   members 的增删改                      见下面那条，有后果
 *   routes.ensurePlan / hideGap / showGap 写的是 route_plans 缓存和"哪几行折叠"
 *   纯视图态                              展开/折叠（含每个 Day 的收起）、选中项、弹窗开关、
 *                                         侧栏、显示路线、地图图层开关 —— 不是数据，
 *                                         撤它没有意义
 *   行程设置（预算/封面/隐藏图层）          弹窗直接调 action，再让服务端那份渲染结果
 *                                         作废掉（预算靠 action 里的 revalidatePath，
 *                                         封面靠调用方的 router.refresh）；封面是
 *                                         base64，50 份内存快照扛不住
 *                                         ⚠️ 别照"都在 trips 表上"顺推：**同一张表上的
 *                                         container_colors（列表/某天的主色）是进快照的**
 *                                         （见上面 places 那条）。判据不是"在哪张表"，
 *                                         而是"它算不算用户给这份行程做的一处内容决定"：
 *                                         隐藏图层是看的人的视图偏好、换个账号看就不该跟
 *                                         着变；颜色是内容本身，改完要能像改名一样撤回来
 *
 * 不进快照 —— 有意，但要知道后果
 *   members   trip_members 是记账的前提而不是行程内容；更硬的理由是 expenses.paid_by
 *             是 restrict 外键，把"删成员"放进快照、再靠整体替换去还原，很可能让
 *             整批同步失败。后果：加完一个成员按撤销，撤掉的是**更早**那个动作。
 *
 * ============================================================
 * ★ 新加一个可撤销功能：照这个清单走
 * ============================================================
 *
 * 第 0 步 · 先决定进不进。不进也行，但上面那两张"不进"清单得添一行并写明理由 ——
 *   "忘了"和"有意不进"在代码里长得一模一样，只有写下来才分得开（规矩一）。
 *
 * 第 1 步 · 数据得有地方待。要么新建一个 provider（贴 TripHistoryProvider 里面），
 *   要么并进已有的某一片。**必须是 TripWorkspace 里静态挂载的**：useRegisterSnapshot
 *   故意不写清理函数，会条件卸载的组件挂不住。
 *
 * 第 2 步 · 在那个 provider 里 useRegisterSnapshot(key, get, set)  —— get 返回这一片
 *   当下的值，set 把快照装回去（就是两个 setState）。
 *
 * 第 3 步 · 每个改了这份数据的 mutator，在**第一个 await 之前**调一次 push()（规矩三）。
 *   一次点击会连着好几个动作的，整段包进 batch()（规矩二）。
 *
 * 第 4 步 · 补四处声明，TypeScript 会挨个报缺什么：
 *   ① TripSnapshot 加一片  ② SNAPSHOT_FEATURES 加 key（这行有 satisfies）
 *   ③ collect() 的返回加一行  ④ syncAll() 加一个同步函数
 *
 * 第 5 步 · 新表就照着 syncFlightsSnapshot 抄（`src/actions/flights.ts`）：查出已存在
 *   的 id → 删掉快照里没有的 → 剩下的**一条多行语句** upsert（`onConflictDoUpdate` +
 *   `sql\`excluded.列\``，别写 createdAt）。
 *   （这里以前还写着"结尾只调一次 revalidatePath"—— 那句已经过期了：客户端手里有完整
 *   副本，同步函数谁都不要再调它，判据见 actions/trips.ts 的 updateTripBudget 上方。）
 *   跨表的 Promise.all 是安全的（这几张表之间没有外键），但同一张表内部有级联的
 *   （places 的 items+lists）不能拆开，理由写在 syncPlacesSnapshot 上。
 *
 * 第 6 步 · 上面那两张清单各添一行。显示/编辑这份数据的组件按规矩五写草稿。
 *
 * ⚠️ TypeScript 拦得住第 4 步的每一处遗漏，**拦不住第 3 步**（忘了 push、忘了 batch
 * 编译完全通过）。所以那一步只能靠人，也就只能靠这份清单和"当场登记"这条规矩。
 * ============================================================
 */

/** 一份快照 = 撤销时"装回去"的完整界面状态，按功能分片 */
export interface TripSnapshot {
  /*
   * ── dayTitles 为什么挂在 places 底下，而不是单开一片 "days" ──
   * 它只是"按 dayDate 索引的副标题表"（DayCard 里那行灰字），语义上完全可以自开一片。
   * 没那么做的理由不是"省事"而是"省不掉"：单开一片要新加一个 provider 才登记得上
   * （useRegisterSnapshot 必须挂在 TripWorkspace 里静态挂载的组件上），而**下面那两处
   * 手改一处都躲不掉** —— 并进已有的片和单开一片，sameSnapshot / syncAll 一样要改
   * （理由和 bookings 那片一字不差）。既然只有它一个字段，就直接挂在 places 下面。
   *
   * （后来 container_colors —— 列表/某天的主色 —— 也照这条路寄在了这一片里。
   *   它同样不该自开一片：为它新建一个 provider 的代价跟上面一模一样。）
   *
   * 代价：它们跟着 places 的 get/set 一起进快照，所以
   *   ① sameSnapshot()  漏了某一个，连改两次时第二次 push() 会被静默去重
   *   ② syncAll()       漏了某一个，撤销只在本地还原、刷新就没了
   * 两处都见下面各自的注释。
   */
  places: {
    items: PlaceItem[];
    lists: PlaceListRow[];
    /** dayDate("yyyy-MM-dd") → 副标题；**没写副标题的那天不占键**（见 buildDayTitles） */
    dayTitles: Record<string, string>;
    /*
     * 图层键（'l:<listId>' / 'd:<dayDate>'）→ hex；**没换过色的容器不占键**
     * （那份默认色是 getColorByListId 现算的，不进快照）。
     *
     * 和 dayTitles 同理，是"寄在 places 底下"的第二个字段（理由见上面那段，
     * 一样要动 sameSnapshot / syncAll 两处）。
     *
     * ⚠️ 两处不同表、别被 sameSnapshot 的引用比较坑到：这一份必须**整份替换**，
     * 永远不要原地改键（places-context 的 setContainerColor 里写着为什么）。
     */
    containerColors: Record<string, string>;
  };
  expenses: Expense[];
  /*
   * ── 三处手改的其中之一 ──
   * 火车并进 bookings 这一片（而不是单开一片 "trains"），所以 SNAPSHOT_FEATURES
   * 不用动、collect()/applySnapshot() 正文也不用提它（bookings 的 get/set 是整体
   * 类型擦除的）。代价是下面这三处 TS **一处都拦不住**，加字段时只能靠人：
   *   ① 就是这里（这一处 TS 其实拦得住 —— bookings 的 get/set 有类型）
   *   ② sameSnapshot()  漏了它，连加两趟火车时第二次 push() 会被静默去重
   *   ③ syncAll()       漏了它，撤销只在本地还原、刷新就没了
   */
  bookings: { flights: Flight[]; hotels: Hotel[]; trains: Train[] };
  notes: Note[];
}

type FeatureKey = keyof TripSnapshot;

/**
 * 谁在快照里 —— 这是**唯一**的声明处。新加一个功能要动四处：这个数组、
 * 上面的 TripSnapshot、下面 collect() 的返回、以及 syncAll() 的分发。
 * 少改哪一处 TypeScript 都会报（数组这行有 satisfies，collect 少一片则对象字面量
 * 直接报缺属性），所以不用担心"漏了一片还编译得过"。
 */
export const SNAPSHOT_FEATURES = [
  "places",
  "expenses",
  "bookings",
  "notes",
] as const satisfies readonly FeatureKey[];

/** 注册表里存的一对函数；类型在存的时候擦掉，取的时候在 collect/applySnapshot 还原 */
interface Entry {
  get: () => unknown;
  set: (value: unknown) => void;
}

const MAX_HISTORY = 50;

interface HistoryContextValue {
  /** 记一份快照。所有改了行程数据的动作都要在动手**之前**调它（见顶部契约） */
  push: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** 把整段组合手势包起来，期间只记第一份快照 */
  batch: <T>(fn: () => Promise<T>) => Promise<T>;
  /** 每撤销/复原一次 +1。手里攥着"数据行的副本"的组件靠它知道自己那份过期了 */
  restoreNonce: number;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);
/**
 * 注册表单独一个 context：它只是 useRegisterSnapshot 的内部通道，业务代码不该碰
 * （所以没跟 push/undo 那些放在一起）。
 */
const RegistryContext = createContext<Map<FeatureKey, Entry> | null>(null);

/**
 * 撤销栈：套在**所有**功能 provider 外面（TripWorkspace 的最外层）。
 *
 * 以前它长在 PlacesProvider 里，于是费用只能靠"改之前把一个 nonce +1、内层 effect
 * 看到变化就替它记一份"来传话 —— 那个间接就是这段代码难懂的原因。抬出来之后，
 * 每个功能自己注册 get/set，谁也不必知道别人的存在。
 */
export function TripHistoryProvider({
  tripId,
  children,
}: {
  tripId: string;
  children: ReactNode;
}) {
  const registry = useRef(new Map<FeatureKey, Entry>()).current;
  const pastRef = useRef<TripSnapshot[]>([]);
  const futureRef = useRef<TripSnapshot[]>([]);
  /** >0 表示正处在 batch() 里，期间只记第一份快照 */
  const batchDepthRef = useRef(0);
  /** 还没同步到库里的那份快照（只留最新的），以及"是不是已经有一趟在跑" */
  const pendingSyncRef = useRef<TripSnapshot | null>(null);
  const syncingRef = useRef(false);
  /** 只用来触发重渲染，好让 canUndo/canRedo 跟着栈长重新算 */
  const [historyVersion, setHistoryVersion] = useState(0);
  const [restoreNonce, setRestoreNonce] = useState(0);

  /**
   * 把每个功能当下的状态收集成一份快照。
   *
   * 注册不全就放弃这次记录并报错：宁可"这个动作撤不了"（一眼能发现），也不要存一份
   * 缺片的快照 —— 那种撤销会还原出半个世界，而且要用户点到才发现。
   */
  const collect = useCallback((): TripSnapshot | null => {
    const missing = SNAPSHOT_FEATURES.filter((k) => !registry.has(k));
    if (missing.length > 0) {
      console.error(
        `撤销栈：${missing.join("、")} 还没注册（见 history-context 顶部的撤销契约），这次动作不记快照`
      );
      return null;
    }
    return {
      places: registry.get("places")!.get() as TripSnapshot["places"],
      expenses: registry.get("expenses")!.get() as TripSnapshot["expenses"],
      bookings: registry.get("bookings")!.get() as TripSnapshot["bookings"],
      notes: registry.get("notes")!.get() as TripSnapshot["notes"],
    };
  }, [registry]);

  const push = useCallback(() => {
    // batch() 里只记第一份 —— 那一份取的是手势开始前的状态（见顶部规矩二）
    if (batchDepthRef.current > 0) return;
    const snap = collect();
    if (!snap) return;
    const past = pastRef.current;
    const top = past[past.length - 1];
    // 同一个 tick 里连着 push 两次时，第二次的状态一个字节都没变，记了也是白记
    // （表现出来就是"撤销按一下没反应"）。见 sameSnapshot 里为什么这样比是安全的。
    if (top && sameSnapshot(top, snap)) return;
    pastRef.current = [...past.slice(-(MAX_HISTORY - 1)), snap];
    futureRef.current = [];
    setHistoryVersion((v) => v + 1);
  }, [collect]);

  /** 把快照装回各个功能。注册表按 key 存的是一对函数，这里还原成具体的片 */
  const applySnapshot = useCallback(
    (snap: TripSnapshot) => {
      registry.get("places")!.set(snap.places);
      registry.get("expenses")!.set(snap.expenses);
      registry.get("bookings")!.set(snap.bookings);
      registry.get("notes")!.set(snap.notes);
      setHistoryVersion((v) => v + 1);
      // 告诉那些攥着数据副本的组件：你们手里那份已经过期了
      setRestoreNonce((n) => n + 1);
    },
    [registry]
  );

  /**
   * 撤销/复原之后的服务器同步：**串行 + 只跑最新一份**。
   *
   * 到 Neon 一趟往返一两秒，连按两下撤销完全正常。两次"整体替换"并发打到同一批表上
   * 会交错（拆成四个函数后写手变成八个），而每次同步本来就是整体替换 —— 中间那份
   * 直接丢掉没关系，最终库里必然是最新那份。所以：只在最新一份上留个记号，上一趟
   * 跑完回头看有没有新的塞进来；已经在跑就直接返回。
   *
   * 失败提示必须说"刷新（F5）"，别让用户去点页面上的刷新按钮：`router.refresh()`
   * 对这个没用 —— 每个 provider 都是 useState(seeds) 只吃初值，客户端状态不会跟着
   * 服务端重渲染而变。另外 Promise.all 是第一个失败就抛、其余照样提交，**没有事务
   * 可回滚**，所以库里可能半新半旧，提示里不能说"什么都没改"。
   */
  const scheduleSync = useCallback(
    (snap: TripSnapshot) => {
      pendingSyncRef.current = snap;
      if (syncingRef.current) return;
      syncingRef.current = true;
      void (async () => {
        let failed = false;
        try {
          while (pendingSyncRef.current) {
            const next = pendingSyncRef.current;
            pendingSyncRef.current = null;
            try {
              await syncAll(tripId, next);
            } catch (err) {
              console.error("撤销同步失败:", err);
              failed = true;
            }
          }
        } finally {
          syncingRef.current = false;
          // 一轮里失败几次都只提示一次：多半是同一个原因（网断了/库挂了），
          // 弹一串 toast 只是吵
          if (failed) {
            toast.error("撤销只在本地生效了 —— 刷新页面（F5）后会变回来");
          }
        }
      })();
    },
    [tripId]
  );

  /** 撤销/复原共用：把当前状态压到另一侧，再装回目标快照 */
  const step = useCallback(
    (from: "past" | "future") => {
      const source = from === "past" ? pastRef.current : futureRef.current;
      if (source.length === 0) return;
      const snap = source[source.length - 1];
      const current = collect();
      if (!current) return; // 注册不全就不动手（collect 已经报过错）
      const rest = source.slice(0, -1);
      if (from === "past") {
        pastRef.current = rest;
        futureRef.current = [...futureRef.current, current];
      } else {
        futureRef.current = rest;
        pastRef.current = [...pastRef.current, current];
      }
      // 本地还原是同步的，手感不受网络影响；库那边排队慢慢追
      applySnapshot(snap);
      scheduleSync(snap);
    },
    [collect, applySnapshot, scheduleSync]
  );

  const undo = useCallback(() => step("past"), [step]);
  const redo = useCallback(() => step("future"), [step]);

  const batch = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    batchDepthRef.current += 1;
    try {
      return await fn();
    } finally {
      batchDepthRef.current -= 1;
    }
  }, []);

  const value = useMemo<HistoryContextValue>(
    () => ({
      push,
      undo,
      redo,
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
      batch,
      restoreNonce,
    }),
    // historyVersion 不是给 value 用的，是让栈变了以后重新算 canUndo/canRedo
    [push, undo, redo, batch, restoreNonce, historyVersion]
  );

  return (
    <RegistryContext.Provider value={registry}>
      <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>
    </RegistryContext.Provider>
  );
}

/**
 * 逐片比**引用**，不是比元素。
 *
 * 项目里所有状态数组都是不可变替换（`[...prev, row]` / `prev.map()`），所以引用相同
 * 就等于内容没变，这个判据是可靠的。**别改成"长度相同 + 元素都在"**：那样会把重排
 * 误判成没变（航班重排就是同长度、同元素、只有顺序不同），凭空丢掉一个历史记录。
 */
function sameSnapshot(a: TripSnapshot, b: TripSnapshot): boolean {
  return (
    a.places.items === b.places.items &&
    a.places.lists === b.places.lists &&
    // ★ 副标题并进 places 这一片，所以这里也要补一行（跟上面 trains 那条一个道理）。
    // 漏了它的后果：先改周一的副标题、再改周二的，第二次 push() 会按"另外两个字段
    // 引用都没变"判定为重复、提前返回 —— 于是**按一下撤销两天的副标题一起没**。
    // dayTitles 每次都是整份替换（{...prev}），所以比引用是可靠的。
    a.places.dayTitles === b.places.dayTitles &&
    // ★ 同上，寄在 places 底下的第二个字段。漏了它的后果：连着给两个列表换色，
    // 第二次 push() 会按"其余字段引用都没变"判定为重复、提前返回 —— 于是
    // **按一下撤销，两个颜色一起退回去**。
    //
    // 比引用在这儿是可靠的，前提是 setContainerColor 里那份永远是整份替换
    // （{...prev} / 删键）。哪天有人图省事写成 prev[key] = color，引用不变，
    // 上面这个后果立刻出现 —— 所以那处注释里特意把这条又写了一遍。
    a.places.containerColors === b.places.containerColors &&
    a.expenses === b.expenses &&
    a.bookings.flights === b.bookings.flights &&
    a.bookings.hotels === b.bookings.hotels &&
    // ★ 新加了一张装在同一片里的表，就必须在这里补一行。
    // 漏了它的后果：连加两趟火车时，第二趟那一下 push() 会按"其余字段引用都没变"
    // 判定为重复、提前返回 —— 于是**按一下撤销两趟一起没**。这是三处手改里最像
    // 鬼故事的一个，编译和界面都看不出来。
    a.bookings.trains === b.bookings.trains &&
    a.notes === b.notes
  );
}

/**
 * 把快照里的每个功能落回各自的表。各功能只管自己的表、彼此没有外键依赖
 * （place_items.source_id / expenses.linked_item_id 都只是 text），所以并发发出去
 * —— 到 Neon 一趟往返一两秒，串行是相加。
 *
 * ⚠️ 唯一不能拆的一处是 places 内部的 items 和 lists，理由写在 syncPlacesSnapshot 上。
 */
async function syncAll(tripId: string, snap: TripSnapshot): Promise<void> {
  await Promise.all([
    syncPlacesSnapshot(tripId, {
      items: snap.places.items,
      lists: snap.places.lists,
    }),
    // ★ 副标题写的是 days 表，跟上面那个 places 同步不是同一张表 —— 它俩只是**登记**
    // 在同一片快照里（理由见 TripSnapshot 上那段），所以这里是两条并发的同步，不是一个。
    // 漏了它的后果：副标题的撤销在界面上看着成了，但从不写回 Neon，刷新就变回来。
    syncDayTitlesSnapshot(tripId, snap.places.dayTitles),
    /*
     * ★ 容器颜色的写回函数**就是 saveContainerColors 本身** —— 它就是"整份替换
     * trips.container_colors 这一列"，跟这里要的形状一模一样，不必再包一层
     * syncXxxSnapshot（那两个 wrapper 存在是因为要删旧行 / 一条多行 upsert）。
     *
     * 漏了它的后果：颜色改完撤销，界面上看着回去了，但从不写回 Neon ——
     * **刷新页面（F5）又变回来**。这是唯一一处能证明"写回"发生过的地方。
     *
     * 并发安全：它和 saveHiddenLayers 各写各的列，PG 行锁会串起来（见那个 action 上
     * 的注释），所以并进这个 Promise.all 不会互相覆盖。
     */
    saveContainerColors(tripId, snap.places.containerColors),
    syncExpensesSnapshot(tripId, snap.expenses),
    syncFlightsSnapshot(tripId, snap.bookings.flights),
    syncHotelsSnapshot(tripId, snap.bookings.hotels),
    // ★ 同上，新表要在这里补一行。漏了它的后果：撤销在界面上看着成了，但从不写回
    // Neon —— **刷新页面（F5）火车又没了**。这是唯一一处能证明"写回"发生过的地方。
    // 加进这个 Promise.all 是安全的，理由见上面那段（这几张表之间没有外键）。
    syncTrainsSnapshot(tripId, snap.bookings.trains),
    syncNotesSnapshot(tripId, snap.notes),
  ]);
}

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) {
    throw new Error("useHistory 必须在 <TripHistoryProvider> 内使用");
  }
  return ctx;
}

/**
 * 功能 provider 用它把自己登记进撤销栈：`get` 取当下这一片，`set` 装回去。
 *
 * 注册在 useLayoutEffect 里而不是 useEffect：后者是宏任务里跑的，注册表会滞后一次
 * 提交，collect() 有可能取到比"上一次操作前"更早的状态。layout effect 在提交阶段
 * 同步跑完，中间插不进任何事件。
 *
 * 故意**不写依赖数组**：每次渲染都重登记一遍，注册表里永远是最新那次渲染的闭包 ——
 * 这正是 push() 能拿到"动手之前"状态的原因。
 * 故意**不返回清理函数**：开发模式 effect 会跑两遍（注册→清理→再注册），有清理反而
 * 会在中间那一下把自己注销掉；而这些功能 provider 都是 TripWorkspace 里静态挂载的、
 * 不会条件卸载，所以"注册后不管"没有后患。别顺手补一个 cleanup。
 */
export function useRegisterSnapshot<K extends FeatureKey>(
  key: K,
  get: () => TripSnapshot[K],
  set: (value: TripSnapshot[K]) => void
): void {
  const registry = useContext(RegistryContext);
  if (!registry) {
    throw new Error("useRegisterSnapshot 必须在 <TripHistoryProvider> 内使用");
  }
  useLayoutEffect(() => {
    registry.set(key, {
      get,
      // 类型擦除：存进去的是"只接受本功能那一片"的 set，还原时的类型正确性由
      // collect() / applySnapshot 保证 —— 那两处是唯一按 key 取值的地方
      set: set as (value: unknown) => void,
    });
  });
}
