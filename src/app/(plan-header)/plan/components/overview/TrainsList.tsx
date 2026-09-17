"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Loader2,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addDays, format, parse } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import TrainCard from "./TrainCard";
import TrainFormFields, {
  emptyDraft,
  validateDraft,
  type TrainDraft,
} from "./TrainFormFields";
import SortableCardGroup from "@/components/SortableCardGroup";
import ListShell from "./ListShell";
import { useBookings } from "@/context/bookings-context";
import { usePlaces } from "@/context/places-context";
import { useHistory } from "@/context/history-context";
import { resolveStation } from "@/lib/stations";
import type { PlaceItemInput } from "@/types/place";
import type { StationOption, TrainSearchItem, TrainStop } from "@/types/train";

/*
 * 概览区的 Trains 列表。
 *
 * 跟 FlightsList/HotelsList 有一处结构性的不同：**一趟火车都没有时这一节整个不存在**
 * （用户原话："火车 list 等我们点击按钮后真的有火车卡了才产生"）。所以空列表时这里
 * 只渲染弹窗、不渲染 ListShell —— 连带两条规则：
 *   - 空列表时 `list-trains` 不在 DOM 里，BookingCard 里现成的 `if (element)` 会静默
 *     返回，不会滚到一个不存在的位置；
 *   - BookingCard 因此必须在"一趟都没有"时**直接开弹窗**（它通过 addIntent 请求，
 *     见下面那个消费它的 effect），而不是去滚列表。
 *
 * ⚠️ 空列表时**不能整个 `return null`**：弹窗也住在这一层，一起 return 掉的话
 * 「一趟都没有时点火车按钮 → 开弹窗」这条主路径就死了（那正是加第一趟火车的唯一入口）。
 *
 * 时刻一律**北京时间**，全链路不做 +8 —— 跟同目录的 FlightsList 正好相反
 * （AviationStack 回 UTC，那边要偏移）。别把那边那套抄过来。
 */

/**
 * 相对某个基准站的跨天前缀："次日" / "+N天"；当天（<=0）不加前缀。
 * departure/arrival 两个下拉的基准站不同，见各自渲染处的注释。
 */
function dayLabel(delta: number): string {
  if (delta <= 0) return "";
  return delta === 1 ? "次日" : `+${delta}天`;
}

/** 上车站看发车时刻、下车站看到达时刻；始发站的 arrive_time / 终到站的 start_time 是 null */
function stopTime(stop: TrainStop, kind: "dep" | "arr"): string | null {
  return kind === "dep" ? stop.startTime ?? stop.arriveTime : stop.arriveTime;
}

/** 概览区的 Trains 列表：已入库火车的卡片 + 「添加火车」弹窗（自动填 / 手动填） */
export default function TrainsList() {
  const {
    trains,
    deleteTrain,
    addTrain,
    reorderTrains,
    expanded,
    setExpanded,
    addIntent,
    clearAddIntent,
  } = useBookings();
  const { dateRange, days, addItem } = usePlaces();
  // 加火车要连带挂两张车站地点卡，一次手势包进 batch，撤销才是一下退回去
  const { batch } = useHistory();

  const [showDialog, setShowDialog] = useState(false);
  // 弹窗的两种模式：查询（走 12306）和手动填写（查不到时的出路，也是主路径）
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [query, setQuery] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<TrainSearchItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [picked, setPicked] = useState<TrainSearchItem | null>(null);
  const [stops, setStops] = useState<TrainStop[]>([]);
  /** 查通那次实际用的日期。跨夜车会用「用户选的那天 - 1」重试，所以它未必等于 date */
  const [stopsDate, setStopsDate] = useState("");
  const [stopsLoading, setStopsLoading] = useState(false);
  const [stopsError, setStopsError] = useState<string | null>(null);
  /** 用前一天才查到时的说明（跨夜车），不是错误 */
  const [stopsNotice, setStopsNotice] = useState<string | null>(null);
  const [fromIndex, setFromIndex] = useState(0);
  const [toIndex, setToIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [manualDraft, setManualDraft] = useState<TrainDraft>(() => emptyDraft());
  /** 手动模式里从联想选中的站点（草稿里只放得下站名和城市，坐标放不下） */
  const [pickedStations, setPickedStations] = useState<{
    from: StationOption | null;
    to: StationOption | null;
  }>({ from: null, to: null });

  const tripDisabled =
    dateRange?.from && dateRange?.to
      ? { before: dateRange.from, after: dateRange.to }
      : undefined;

  /** 行程第一天 "yyyy-MM-dd"；手动填写的新建日期默认落在这里 */
  const tripStartIso = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const dateIso = date ? format(date, "yyyy-MM-dd") : "";
  /** 下车站选项里"现在选中的上车站" */
  const fromStop = stops[fromIndex];
  const toStop = stops[toIndex];

  const openTrainDialog = () => {
    setMode("search");
    setQuery("");
    setCandidates([]);
    setSearchError(null);
    setPicked(null);
    setStops([]);
    setStopsDate("");
    setStopsLoading(false);
    setStopsError(null);
    setStopsNotice(null);
    setFromIndex(0);
    setToIndex(0);
    setDate(dateRange?.from);
    setManualDraft(emptyDraft(tripStartIso));
    setPickedStations({ from: null, to: null });
    setShowDialog(true);
  };

  /*
   * BookingCard 上的「火车」按钮在**兄弟组件**里，它通过 addIntent 请求开弹窗
   * （见 bookings-context 里那段注释）。这里读完立刻清掉，否则这个意图会一直挂着，
   * 列表下次挂载又弹一次。
   *
   * openTrainDialog 用 ref 攥住：它每次渲染都是新函数，塞进依赖数组会让这个 effect
   * 每次渲染都跑一遍（仓库里没有 eslint 配置，没人会提醒）。要的只是"最新的那一个"。
   * 跟 bookings-context 里 cleanupRef 是同一套写法。
   */
  const openRef = useRef(openTrainDialog);
  useLayoutEffect(() => {
    openRef.current = openTrainDialog;
  });
  useEffect(() => {
    if (addIntent !== "trains") return;
    openRef.current();
    clearAddIntent();
  }, [addIntent, clearAddIntent]);

  const setManualField = <K extends keyof TrainDraft>(
    key: K,
    value: TrainDraft[K]
  ) => setManualDraft((prev) => ({ ...prev, [key]: value }));

  /**
   * 切到手动填写：把查询那一步已经拿到的信息带过去 —— 查不到才发现要手填，
   * 不该让人再敲一遍。候选选中过就带上始发/终到站名，只损失两个时刻。
   */
  const enterManualMode = () => {
    setManualDraft({
      ...emptyDraft(dateIso || tripStartIso),
      trainNumber: (picked?.trainNumber ?? query).trim().toUpperCase(),
      fromStation: picked?.fromStation ?? "",
      toStation: picked?.toStation ?? "",
    });
    setPickedStations({ from: null, to: null });
    setMode("manual");
  };

  /**
   * 按车次查候选。**只在点「查询」或按回车时调**（见 /api/trains 顶部的姿态说明）：
   * 不随打字发请求、不重试、不后台轮询。
   */
  const searchTrain = async () => {
    const keyword = query.trim().toUpperCase();
    if (!keyword || !date) return;

    setSearching(true);
    setSearchError(null);
    setCandidates([]);
    setPicked(null);
    setStops([]);
    setStopsError(null);
    setStopsNotice(null);

    try {
      const res = await fetch(
        `/api/trains?mode=search&keyword=${encodeURIComponent(keyword)}&date=${dateIso}`
      );
      if (res.status === 404) {
        // 上游空数组有两种成因（车次不存在 / 超出 15 天预售期），文案里一起说
        setSearchError("没查到这趟车（车次号不对，或该日期还没到 15 天预售期）");
        return;
      }
      if (!res.ok) {
        setSearchError("12306 查询失败，请稍后重试");
        return;
      }
      const data = (await res.json()) as { trains?: TrainSearchItem[] };
      const list = Array.isArray(data.trains) ? data.trains : [];
      if (list.length === 0) {
        setSearchError("没查到这趟车（车次号不对，或该日期还没到 15 天预售期）");
        return;
      }
      setCandidates(list);
      // 只有一条候选（搜全码如 G1030 基本都是）就直接选中，省一次点击。
      // 不 await：让「查询」的转圈立刻停下，经停表自己有转圈
      if (list.length === 1) void loadStops(list[0]);
    } catch {
      setSearchError("12306 查询失败，请检查网络");
    } finally {
      setSearching(false);
    }
  };

  /** 打一次上游的经停表；404 回 null（"这天没这趟车"是正常结果，不是异常） */
  const fetchStops = async (
    candidate: TrainSearchItem,
    forDateIso: string
  ): Promise<TrainStop[] | null> => {
    const res = await fetch(
      `/api/trains?mode=stops&train_no=${encodeURIComponent(
        candidate.trainNo
      )}&date=${forDateIso}`
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`经停站查询失败：${res.status}`);
    const data = (await res.json()) as { stops?: TrainStop[] };
    return Array.isArray(data.stops) && data.stops.length > 0 ? data.stops : null;
  };

  /**
   * 选中一个车次 → 拉它的经停表 → 两条腿默认取始发/终到。
   *
   * **跨夜车的那一次重试**：12306 的 `depart_date` 是**始发站发车日**，而用户脑子里
   * 的"出发日期"是**自己上车那天**。一趟晚上发车、次日早晨到中间站的车，按用户那天
   * 去查就是空的。所以查不到时拿前一天再打一次 —— 这是**一次失败点击上的一次额外
   * 请求**，不是循环，也不是重试策略。别在这上面加第三次。
   */
  const loadStops = async (candidate: TrainSearchItem) => {
    if (!dateIso) return;
    setStopsLoading(true);
    setStopsError(null);
    setStopsNotice(null);
    setPicked(candidate);
    setStops([]);
    setStopsDate("");

    try {
      let next = await fetchStops(candidate, dateIso);
      let usedDate = dateIso;

      if (!next) {
        const prevIso = format(
          addDays(parse(dateIso, "yyyy-MM-dd", new Date()), -1),
          "yyyy-MM-dd"
        );
        next = await fetchStops(candidate, prevIso);
        if (next) {
          usedDate = prevIso;
          setStopsNotice(
            `这趟车按 ${dateIso} 查不到经停站，按前一天（${prevIso}）发车查到了 —— 应该是趟跨夜车。下面两个下拉里的时刻都是 ${prevIso} 当天的。`
          );
        }
      }

      if (!next) {
        setStopsError("没查到这趟车的经停站（12306 可能暂时不可用）");
        return;
      }

      setStops(next);
      setStopsDate(usedDate);
      setFromIndex(0);
      setToIndex(next.length - 1);
    } catch (err) {
      console.error("经停站查询失败:", err);
      setStopsError("12306 查询失败，请稍后重试");
    } finally {
      setStopsLoading(false);
    }
  };

  /**
   * 上车站改了：把下车站推到它后面。
   * 受控的一对 Select 必须始终自洽 —— 上车站挪到下车站之后，下车站就成了"往前开"，
   * 而出发卡/到达卡、两个日期全是按这个顺序算的。上车站最大只到倒数第二站
   * （见下面 options 的截取），所以 `i + 1` 一定落在合法范围内。
   */
  const handleFromChange = (value: string) => {
    const next = Number(value);
    setFromIndex(next);
    setToIndex((prev) => (prev > next ? prev : next + 1));
  };

  /**
   * 在某天的行程里挂一份车站地点实例（上车站/下车站各调一次），绑定到这趟火车。
   *
   * 跟航班那套的差别：**没有"有码才挂"这道闸**。航班能靠 `airport-${code}` 判断，
   * 是因为它有一张内置机场表；火车没有，而两站卡是用户拍板**无条件各挂一张**的。
   * 所以高德查不到时，groupKey 退回 12306 的站名。
   */
  const addStationItem = async (
    dayDate: string,
    trainId: string,
    station: StationOption | null,
    fallbackName: string
  ): Promise<void> => {
    if (!days.some((d) => d.dayDate === dayDate)) {
      // 行程最后一天的跨夜车，到达日就在行程之外了。**要出声**：静默跳过的话
      // 用户只会发现"到达站的卡没出现"，然后以为坏了（航班那边今天是静默的）
      console.warn(`站点卡没挂上：${dayDate} 不在行程内`);
      toast.warning(`${dayDate} 不在行程内，${fallbackName} 的站点卡没挂上`);
      return;
    }
    const input: PlaceItemInput = {
      groupKey: `station-${station?.id ?? fallbackName}`,
      name: station?.name ?? fallbackName,
      address: station?.city ?? null,
      lng: station?.lng ?? null,
      lat: station?.lat ?? null,
      sourceKind: "train", // 删除火车时级联删掉这两份站点
      sourceId: trainId,
    };
    await addItem(input, { kind: "day", dayDate }, { select: false });
  };

  /**
   * 自动填提交：入库火车 + 挂两张站点卡，整段一个手势（包 batch）。
   *
   * 两个日期按**各站相对始发站发车日的偏移**算，不是按"用户选的那天 + 差值"：
   * 用户完全可能在中间站上车，那站的 offset 就不是 0，而上车站的乘车日必须是
   * 「那天 + 该站偏移」。默认（始发站上车，offset 0）两条算法结果一样。
   */
  const handleAddFromSearch = async () => {
    if (!picked || !fromStop || !toStop || stops.length === 0) return;
    if (toIndex <= fromIndex) return;

    const depTime = stopTime(fromStop, "dep");
    const arrTime = stopTime(toStop, "arr");
    if (!depTime || !arrTime) {
      toast.error("这趟车缺少上车站或下车站的时刻，无法添加");
      return;
    }

    const base = parse(stopsDate, "yyyy-MM-dd", new Date());
    const depDateIso = format(addDays(base, fromStop.dayOffset), "yyyy-MM-dd");
    const arrDateIso = format(addDays(base, toStop.dayOffset), "yyyy-MM-dd");

    setAdding(true);
    try {
      const ok = await batch(async () => {
        // 站名**统一用高德全称**（用户拍板）：12306 写「宜昌北」、高德写「宜昌北站」，
        // 落库和卡片上都用后者。高德查不到就退回 12306 的写法。
        const [fromInfo, toInfo] = await Promise.all([
          resolveStation(null, fromStop.stationName),
          resolveStation(null, toStop.stationName),
        ]);
        const created = await addTrain({
          trainNumber: picked.trainNumber,
          fromStation: fromInfo?.name ?? fromStop.stationName,
          fromCity: fromInfo?.city ?? null,
          toStation: toInfo?.name ?? toStop.stationName,
          toCity: toInfo?.city ?? null,
          date: depDateIso,
          departureTime: depTime,
          arrivalDate: arrDateIso,
          arrivalTime: arrTime,
        });
        if (!created) return false;
        await Promise.all([
          addStationItem(depDateIso, created.id, fromInfo, fromStop.stationName),
          addStationItem(arrDateIso, created.id, toInfo, toStop.stationName),
        ]);
        return true;
      });
      if (!ok) {
        toast.error("添加失败，请重试");
        return;
      }
      toast.success("火车已添加");
      // 火车这一节的展开态初始是 false（理由见 bookings-context），刚加完得让人看见
      setExpanded("trains", true);
      setShowDialog(false);
    } catch (err) {
      console.error("添加火车失败:", err);
      toast.error("添加失败，请重试");
    } finally {
      setAdding(false);
    }
  };

  /** 手动提交：不查 12306，两个站名仍尽量解析成高德的站点（拿城市和坐标给站点卡用） */
  const handleManualAdd = async () => {
    const missing = validateDraft(manualDraft);
    if (missing) {
      toast.error(`请填写${missing}`);
      return;
    }

    const depDateIso = manualDraft.date;
    // 到达日留空按当天算（validateDraft 要求必填，这里是第二道保险）
    const arrDateIso = manualDraft.arrivalDate || manualDraft.date;

    setAdding(true);
    try {
      // 与自动填同理：入库 + 挂站点卡是同一个手势，包进 batch
      const ok = await batch(async () => {
        // 联想里选中过就直接用那条；只打了站名（或打的全称正好是表里的）也尽力解析一次
        const [fromInfo, toInfo] = await Promise.all([
          resolveStation(pickedStations.from, manualDraft.fromStation),
          resolveStation(pickedStations.to, manualDraft.toStation),
        ]);
        const created = await addTrain({
          trainNumber: manualDraft.trainNumber.trim(),
          fromStation: fromInfo?.name ?? manualDraft.fromStation.trim(),
          // 城市可空：只打了站名、高德没认出来的就没有城市
          fromCity: fromInfo?.city ?? null,
          toStation: toInfo?.name ?? manualDraft.toStation.trim(),
          toCity: toInfo?.city ?? null,
          date: depDateIso,
          departureTime: manualDraft.departureTime,
          arrivalDate: arrDateIso,
          arrivalTime: manualDraft.arrivalTime,
        });
        if (!created) return false;
        await Promise.all([
          addStationItem(
            depDateIso,
            created.id,
            fromInfo,
            manualDraft.fromStation.trim()
          ),
          addStationItem(
            arrDateIso,
            created.id,
            toInfo,
            manualDraft.toStation.trim()
          ),
        ]);
        return true;
      });
      if (!ok) {
        toast.error("添加失败，请重试");
        return;
      }
      toast.success("火车已添加");
      setExpanded("trains", true);
      setShowDialog(false);
    } catch (err) {
      console.error("手动添加火车失败:", err);
      toast.error("添加失败，请重试");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteTrain = async (id: string) => {
    try {
      // 站点卡与费用的清理收在 deleteTrain 里了（它才知道这个动作的全部后果）
      await deleteTrain(id);
      toast.success("火车已删除");
    } catch {
      toast.error("删除失败，请重试");
    }
  };

  /*
   * 12306 只预售 15 天内（含当天）的车票，超出的日期上游静默回空数组 →
   * 用户会读成"车次号写错了"。所以在点查询**之前**就提示。
   * **不禁用按钮**：窗口每天往前挪，禁掉会让人以为坏了（而手填本来就不受限）。
   * 「今天」取本地日 —— 12306 是北京时间，国内机器的本地日就是它那天。
   */
  const presaleEndIso = format(addDays(new Date(), 14), "yyyy-MM-dd");
  const beyondPresale = dateIso !== "" && dateIso > presaleEndIso;

  // 两个上/下车站下拉：上车站不列**终到站**（在那儿"上车"无路可坐），
  // 下车站只列上车站之后的站。两条规则都不依赖时刻是否为空，但时刻为空的站
  // （始发站的到达时刻、终到站的发车时刻）已经被这两条范围规则挡在外面了。
  const fromOptions = stops.slice(0, -1);
  const toOptions = stops.slice(fromIndex + 1);
  const rideDays = fromStop && toStop ? toStop.dayOffset - fromStop.dayOffset : 0;
  const canSubmitFromSearch =
    picked !== null && stops.length > 0 && toIndex > fromIndex && !stopsLoading;

  return (
    <>
      {/*
        空列表时**没有这一节**（用户要的"等真有火车卡了才产生"）。于是
        `getElementById("list-trains")` 为 null，BookingCard 里现成的 if 会静默返回 ——
        所以它在空列表时必须走"直接开弹窗"那条分支，而不是滚过来。
      */}
      {trains.length > 0 && (
        <ListShell
          anchorId="list-trains"
          title="Trains"
          expanded={expanded.trains}
          onExpandedChange={(v) => setExpanded("trains", v)}
        >
          <SortableCardGroup
            ids={trains.map((t) => t.id)}
            onReorder={reorderTrains}
            onDelete={handleDeleteTrain}
            deleteTitle="删除这趟火车"
            renderItem={(id) => {
              const train = trains.find((t) => t.id === id);
              return train ? <TrainCard train={train} /> : null;
            }}
          />
          {/* mt-2：三处「+ 添加…」是同一处样式（另两处在 Flights/Hotels），一起改 */}
          <Button
            variant="link"
            className="mt-2 text-sm text-gray-400 hover:text-gray-600 p-0 h-auto"
            onClick={openTrainDialog}
          >
            + 添加一趟火车
          </Button>
        </ListShell>
      )}

      {/* 火车弹窗。空列表时也在（它是加第一趟火车的唯一入口） */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        {/*
          宽度/高度跟航班弹窗一致：默认 max-w-sm 塞两列表单，日期按钮会被截成
          「2024年9月…」；max-h + overflow-y-auto 防止手动表单在矮窗口里超屏。
        */}
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode === "manual" ? "手动填写火车" : "添加火车"}</DialogTitle>
            {mode === "manual" && (
              <Button
                type="button"
                variant="link"
                className="h-auto w-fit p-0 text-xs text-gray-500 hover:text-gray-800"
                onClick={() => setMode("search")}
              >
                <ArrowLeft className="size-3.5" />
                返回查询
              </Button>
            )}
          </DialogHeader>

          {mode === "manual" && (
            <div className="space-y-3 py-2">
              <TrainFormFields
                draft={manualDraft}
                onChange={setManualField}
                disabled={tripDisabled}
                fallbackMonth={dateRange?.from}
                onStationPick={(leg, station) =>
                  setPickedStations((prev) => ({ ...prev, [leg]: station }))
                }
              />
              <p className="text-xs text-gray-400">
                站名从下拉里选中的话，上车站/下车站会各自加进当天行程（有坐标的还会出现在地图上）；
                完全手打、高德也认不出来的站挂不上，只留在这个 Trains 列表里。
              </p>
            </div>
          )}

          {/* 查询面板（两个面板互斥，各判各的，省得整块重新缩进） */}
          {mode === "search" && (
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="trainNumber">车次</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    id="trainNumber"
                    placeholder="例如：G1030 / D2374"
                    className="uppercase flex-1"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !searching) void searchTrain();
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={() => void searchTrain()}
                    disabled={!query.trim() || !date || searching}
                    className="shrink-0"
                  >
                    {searching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span className="ml-1">查询</span>
                  </Button>
                </div>

                {/* 出发日期 = 12306 语义里的「始发站发车日」；跨夜车会自动拿前一天再试一次 */}
                <div className="mt-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? (
                          format(date, "yyyy年M月d日 EEE", { locale: zhCN })
                        ) : (
                          <span className="text-gray-500">选择出发日期</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        disabled={tripDisabled}
                        defaultMonth={date ?? dateRange?.from}
                        numberOfMonths={2}
                        locale={zhCN}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {beyondPresale && (
                  <p className="text-xs text-amber-600 mt-1">
                    12306 只预售 15 天内的车票（到 {presaleEndIso}），这天还查不到 ——
                    建议直接
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs text-orange-600 hover:text-orange-700"
                      onClick={enterManualMode}
                    >
                      手动填写
                    </Button>
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  按车次查真实停站和时刻。查不到？
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs text-orange-600 hover:text-orange-700"
                    onClick={enterManualMode}
                  >
                    手动填写
                  </Button>
                </p>
              </div>

              {searchError && (
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-red-500">{searchError}</span>
                  {/* 查不到是常态（预售期、车次号、12306 抽风），这里给一条出路 */}
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm text-orange-600 hover:text-orange-700"
                    onClick={enterManualMode}
                  >
                    手动填写
                  </Button>
                </div>
              )}

              {/* 候选列表：12306 的 keyword 是前缀匹配（"G10" 会回 G10、G100…），所以是列表 */}
              {candidates.length > 1 && (
                <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {candidates.map((c) => (
                    <button
                      key={c.trainNo}
                      type="button"
                      onClick={() => void loadStops(c)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
                    >
                      <span className="w-16 shrink-0 font-semibold text-gray-900">
                        {c.trainNumber}
                      </span>
                      <span className="truncate text-sm text-gray-600">
                        {c.fromStation}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="truncate text-sm text-gray-600">
                        {c.toStation}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {stopsNotice && (
                <p className="text-xs text-amber-600">{stopsNotice}</p>
              )}

              {stopsLoading && (
                <p className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在查这趟车的停站…
                </p>
              )}

              {stopsError && (
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-red-500">{stopsError}</span>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm text-orange-600 hover:text-orange-700"
                    onClick={enterManualMode}
                  >
                    手动填写
                  </Button>
                </div>
              )}

              {picked && stops.length > 0 && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                  <div className="text-xs text-gray-500">
                    {picked.trainNumber} · {picked.fromStation} → {picked.toStation} ·{" "}
                    {stops.length} 站
                    {candidates.length > 1 && (
                      <Button
                        type="button"
                        variant="link"
                        className="ml-2 h-auto p-0 text-xs text-gray-500 hover:text-gray-800"
                        onClick={() => {
                          setPicked(null);
                          setStops([]);
                          setStopsDate("");
                        }}
                      >
                        换一趟
                      </Button>
                    )}
                  </div>

                  {/*
                    两个下拉的**跨天基准不同**，各自取在那个位置上才有意义的那个：
                     - 上车站看的是"这趟车哪天经过这儿"，基准是**始发站发车日**（= 上面
                       那个日期），所以用的是站自己的 dayOffset；
                     - 下车站看的是"坐多久"（用户真正关心的），基准是**上车站**，
                       所以用两个 dayOffset 的差。
                    默认（始发站上车）两者重合，中间站上车时下面那行小字说清楚。
                  */}
                  <div className="space-y-1">
                    <Label className="text-xs font-normal text-gray-500">上车站</Label>
                    <Select value={String(fromIndex)} onValueChange={handleFromChange}>
                      <SelectTrigger className="w-full" aria-label="上车站">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fromOptions.map((stop, i) => {
                          const t = stopTime(stop, "dep");
                          if (!t) return null; // 没有发车时刻的站上不了车
                          return (
                            <SelectItem key={stop.stationNo} value={String(i)}>
                              {`${dayLabel(stop.dayOffset)}${stop.stationName} · ${t}`}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-normal text-gray-500">下车站</Label>
                    <Select
                      value={String(toIndex)}
                      onValueChange={(v) => setToIndex(Number(v))}
                    >
                      <SelectTrigger className="w-full" aria-label="下车站">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {toOptions.map((stop, i) => {
                          const t = stopTime(stop, "arr");
                          if (!t) return null; // 始发站的到达时刻是 "----"
                          const index = fromIndex + 1 + i;
                          const delta = fromStop
                            ? stop.dayOffset - fromStop.dayOffset
                            : stop.dayOffset;
                          return (
                            <SelectItem key={stop.stationNo} value={String(index)}>
                              {`${dayLabel(delta)}${stop.stationName} · ${t}`}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <p className="text-[11px] text-gray-400">
                    上车站的时刻按始发站发车日（{stopsDate}）标注；下车站按你上车的时刻往后数。
                  </p>

                  {/* 确认块：这一段就是最终要入库的四样东西 */}
                  {fromStop && toStop && (
                    <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-lg font-bold text-gray-900">
                            {stopTime(fromStop, "dep")}
                          </div>
                          <div className="text-sm text-gray-500">
                            {fromStop.stationName}
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-gray-400" />
                        <div>
                          <div className="text-lg font-bold text-gray-900">
                            {stopTime(toStop, "arr")}
                          </div>
                          <div className="text-sm text-gray-500">
                            {toStop.stationName}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {format(
                          addDays(
                            parse(stopsDate, "yyyy-MM-dd", new Date()),
                            fromStop.dayOffset
                          ),
                          "M月d日"
                        )}
                        {" 出发"}
                        {rideDays > 0 &&
                          ` · ${format(
                            addDays(
                              parse(stopsDate, "yyyy-MM-dd", new Date()),
                              toStop.dayOffset
                            ),
                            "M月d日"
                          )} 到达（+${rideDays}天）`}
                      </div>
                      <p className="text-[11px] text-gray-400">
                        添加时站名会用高德的全称（如「宜昌北」→「宜昌北站」），查不到就按
                        12306 的写法存。
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              取消
            </Button>
            {/* 两种模式共用这个按钮，只有能不能点 / 点了做什么不同 */}
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              disabled={adding || (mode === "search" && !canSubmitFromSearch)}
              onClick={mode === "manual" ? handleManualAdd : handleAddFromSearch}
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "添加火车"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
