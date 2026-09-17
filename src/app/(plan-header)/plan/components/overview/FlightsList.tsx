"use client";

import { useState } from "react";
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
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import FlightCard from "./FlightCard";
import FlightFormFields, {
  emptyDraft,
  validateDraft,
  type FlightDraft,
} from "./FlightFormFields";
import SortableCardGroup from "@/components/SortableCardGroup";
import { useBookings } from "@/context/bookings-context";
import { usePlaces } from "@/context/places-context";
import { useHistory } from "@/context/history-context";
import type { PlaceItemInput } from "@/types/place";
import type { FlightApiResult } from "@/types/flight";
import { getAirportByName, getAirportInfo } from "@/lib/airport-coordinates";
import ListShell from "./ListShell";

/** 源数据时间是 UTC，统一 +8 转成北京时间（国内航班无夏令时） */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
function toBeijingDate(iso: string): Date {
  return new Date(new Date(iso).getTime() + BEIJING_OFFSET_MS);
}

/** 概览区的 Flights 列表：已入库航班的卡片 + 「添加一个航班」弹窗 */
export default function FlightsList() {
  const { flights, deleteFlight, addFlight, expanded, setExpanded, reorderFlights } =
    useBookings();
  const { dateRange, days, addItem } = usePlaces();
  // 加航班要连带挂两张机场地点卡，一次手势包进 batch，撤销才是一下退回去
  const { batch } = useHistory();

  const [showFlightDialog, setShowFlightDialog] = useState(false);
  const [flightQuery, setFlightQuery] = useState("");
  const [flightSearching, setFlightSearching] = useState(false);
  const [flightResult, setFlightResult] = useState<FlightApiResult | null>(null);
  const [flightError, setFlightError] = useState<string | null>(null);
  const [flightDate, setFlightDate] = useState<Date | undefined>();
  const [flightAdding, setFlightAdding] = useState(false);
  // 弹窗的两种模式：搜索（走 AviationStack）和手动填写（API 查不到时的出路）
  const [manualMode, setManualMode] = useState(false);
  const [manualDraft, setManualDraft] = useState<FlightDraft>(() => emptyDraft());

  const tripDisabled =
    dateRange?.from && dateRange?.to
      ? { before: dateRange.from, after: dateRange.to }
      : undefined;

  /** 行程第一天 "yyyy-MM-dd"；两个模式的新建日期都默认落在这里 */
  const tripStartIso = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";

  const openFlightDialog = () => {
    setFlightQuery("");
    setFlightResult(null);
    setFlightError(null);
    setFlightSearching(false);
    setFlightDate(dateRange?.from);
    setManualMode(false);
    setManualDraft(emptyDraft(tripStartIso));
    setShowFlightDialog(true);
  };

  /** 切到手动填写：把刚才敲的航班号带过去 —— 查不到才发现要手填，不该让人再敲一遍 */
  const enterManualMode = () => {
    setManualDraft({
      ...emptyDraft(tripStartIso),
      flightNumber: flightQuery.trim().toUpperCase(),
    });
    setManualMode(true);
  };

  const setManualField = <K extends keyof FlightDraft>(
    key: K,
    value: FlightDraft[K]
  ) => setManualDraft((prev) => ({ ...prev, [key]: value }));

  const searchFlight = async () => {
    const code = flightQuery.trim().toUpperCase();
    if (!code) return;
    setFlightSearching(true);
    setFlightError(null);
    setFlightResult(null);
    try {
      const res = await fetch(`/api/flights?flight_iata=${encodeURIComponent(code)}`);
      if (!res.ok) {
        setFlightError(
          res.status === 404 ? "未找到该航班，请检查航班号" : "查询失败，请稍后重试"
        );
        return;
      }
      const data = (await res.json()) as FlightApiResult;
      setFlightResult(data);
    } catch {
      setFlightError("查询失败，请检查网络");
    } finally {
      setFlightSearching(false);
    }
  };

  /**
   * 在某天的行程内自动挂一份机场地点实例（出发/到达机场各调一次），绑定到所属航班。
   *
   * 返回 promise 而不是发射后不管：这两份地点实例是"加航班"这个手势的一部分，
   * 撤销栈要在整个手势结束前把它们记全（见 history-context 的 batch）。
   */
  const addAirportItem = async (
    dayDate: string,
    flightId: string,
    leg: {
      code: string;
      airport: string;
      city: string | null;
      lng: number | null;
      lat: number | null;
    },
  ): Promise<void> => {
    // 只限制该日必须在行程内。机场坐标在国内映射表里才带（地图上可画 marker）；
    // 不在表里（如柳州 LZH 等中小机场/国际段）仍照常生成地点实例——只是没有坐标、
    // 仅显示在当天列表里，地图不画。不能因为缺坐标就把降落/起飞机场整个漏掉。
    if (!days.some((d) => d.dayDate === dayDate)) return;
    const input: PlaceItemInput = {
      groupKey: `airport-${leg.code}`,
      name: leg.airport,
      address: leg.city ?? null,
      lng: leg.lng ?? null,
      lat: leg.lat ?? null,
      sourceKind: "flight", // 删除航班时级联删除这两份机场地点
      sourceId: flightId,
    };
    await addItem(input, { kind: "day", dayDate }, { select: false });
  };

  const handleAddFlight = async () => {
    const result = flightResult;
    if (!result || !flightDate) return;
    const { departure, arrival } = result;
    if (!departure.time || !arrival.time) {
      toast.error("该航班缺少起降时刻，无法添加");
      return;
    }

    // 源时间是 UTC，+8 得到北京时间；arrival 相对 departure 的天数差决定"到达日"
    const depBJ = toBeijingDate(departure.time);
    const arrBJ = toBeijingDate(arrival.time);
    const dayOffset = differenceInCalendarDays(arrBJ, depBJ);
    const depDateIso = format(flightDate, "yyyy-MM-dd");
    const arrDateIso = format(addDays(flightDate, dayOffset), "yyyy-MM-dd");

    setFlightAdding(true);
    try {
      // 整段是一个手势：入库航班 + 挂出发/到达两张机场地点卡。batch 让撤销栈只记
      // 第一份快照（= 动手之前），按一下撤销这三样一起退回去。
      const ok = await batch(async () => {
        const created = await addFlight({
          from: departure.city ?? departure.code,
          fromCity: departure.airport,
          fromCode: departure.code,
          to: arrival.city ?? arrival.code,
          toCity: arrival.airport,
          toCode: arrival.code,
          date: depDateIso,
          departureTime: format(depBJ, "HH:mm"),
          arrivalTime: format(arrBJ, "HH:mm"),
          flightNumber: result.flightNumber,
          airline: result.airline, // 查回来的航司要一起入库，否则只显示在弹窗预览里、卡片上没有
          arrivalDate: arrDateIso,
          arrivalLng: arrival.lng,
          arrivalLat: arrival.lat,
        });
        if (!created) return false;
        // 出发机场挂出发日、到达机场挂到达日（仅要求该日在行程内，坐标可有可无），都绑定到该航班。
        // 并发送出（到 Neon 一趟往返一两秒，串行是相加），但要等它们都回来才算这次手势做完
        await Promise.all([
          addAirportItem(depDateIso, created.id, {
            code: departure.code,
            airport: departure.airport,
            city: departure.city,
            lng: departure.lng ?? null,
            lat: departure.lat ?? null,
          }),
          addAirportItem(arrDateIso, created.id, {
            code: arrival.code,
            airport: arrival.airport,
            city: arrival.city,
            lng: arrival.lng ?? created.arrivalLng ?? null,
            lat: arrival.lat ?? created.arrivalLat ?? null,
          }),
        ]);
        return true;
      });
      if (!ok) {
        toast.error("添加失败，请重试");
        return;
      }
      toast.success("航班已添加");
      setShowFlightDialog(false);
      setFlightResult(null);
      setFlightQuery("");
    } catch (error) {
      console.error("添加航班失败:", error);
      toast.error("添加失败，请重试");
    } finally {
      setFlightAdding(false);
    }
  };

  /**
   * 手动添加：不查 API，直接用表单里的值入库。
   *
   * 机场地点**能挂就挂**：三字码是从下拉里选出来的（手打的机场名如果正好等于
   * 表里的全称，也认）。有码才拼得出 `airport-PEK`，同一个机场经 API 添加和经
   * 手动添加才归并成同一个 groupKey，不会在当天列表里出现两条。
   * 没码（表外的机场）就只进 Flights 列表 —— 硬拿机场名拼 key 会拼出第二个 key。
   */
  const handleManualAdd = async () => {
    const missing = validateDraft(manualDraft, { requireCities: true });
    if (missing) {
      toast.error(`请填写${missing}`);
      return;
    }

    const fromCode =
      manualDraft.fromCode || getAirportByName(manualDraft.fromCity)?.code || "";
    const toCode =
      manualDraft.toCode || getAirportByName(manualDraft.toCity)?.code || "";
    // 到达日留空按当天算 —— 国内航段绝大多数当天到；真的跨天该自己填到达日期
    const arrDateIso = manualDraft.arrivalDate || manualDraft.date;

    setFlightAdding(true);
    try {
      // 与 handleAddFlight 同理：入库 + 挂机场地点卡是同一个手势，包进 batch
      const ok = await batch(async () => {
        const created = await addFlight({
          flightNumber: manualDraft.flightNumber.trim(),
          airline: manualDraft.airline.trim() || null,
          from: manualDraft.from.trim(),
          fromCity: manualDraft.fromCity.trim(),
          fromCode: fromCode || null,
          to: manualDraft.to.trim(),
          toCity: manualDraft.toCity.trim(),
          toCode: toCode || null,
          date: manualDraft.date,
          departureTime: manualDraft.departureTime,
          arrivalTime: manualDraft.arrivalTime,
          arrivalDate: manualDraft.arrivalDate || null,
        });
        if (!created) return false;
        // 有码才挂：坐标查得到就带坐标（地图上能画），查不到也照样挂（只在当天列表里）
        const pending: Promise<void>[] = [];
        if (fromCode) {
          const info = getAirportInfo(fromCode);
          pending.push(
            addAirportItem(manualDraft.date, created.id, {
              code: fromCode,
              airport: manualDraft.fromCity.trim(),
              city: manualDraft.from.trim() || null,
              lng: info?.lng ?? null,
              lat: info?.lat ?? null,
            })
          );
        }
        if (toCode) {
          const info = getAirportInfo(toCode);
          pending.push(
            addAirportItem(arrDateIso, created.id, {
              code: toCode,
              airport: manualDraft.toCity.trim(),
              city: manualDraft.to.trim() || null,
              lng: info?.lng ?? null,
              lat: info?.lat ?? null,
            })
          );
        }
        await Promise.all(pending);
        return true;
      });
      if (!ok) {
        toast.error("添加失败，请重试");
        return;
      }
      toast.success("航班已添加");
      setShowFlightDialog(false);
    } catch (error) {
      console.error("手动添加航班失败:", error);
      toast.error("添加失败，请重试");
    } finally {
      setFlightAdding(false);
    }
  };

  const handleDeleteFlight = async (id: string) => {
    try {
      // 机场地点与费用的清理收在 deleteFlight 里了（它才知道这个动作的全部后果）
      await deleteFlight(id);
      toast.success("航班已删除");
    } catch {
      toast.error("删除失败，请重试");
    }
  };

  return (
    <>
      <ListShell
        anchorId="list-flights"
        title="Flights"
        expanded={expanded.flights}
        onExpandedChange={(v) => setExpanded("flights", v)}
      >
        {/* 卡片自带 hover 手柄/垃圾桶，可在本列表内拖动排序 */}
        <SortableCardGroup
          ids={flights.map((f) => f.id)}
          onReorder={reorderFlights}
          onDelete={handleDeleteFlight}
          deleteTitle="删除这个航班"
          renderItem={(id) => {
            const flight = flights.find((f) => f.id === id);
            return flight ? <FlightCard flight={flight} /> : null;
          }}
        />
        {/*
          mt-2：跟上面最后一张卡拉开 8px。只加上边距，下边距仍是 ListShell 内容区的
          pb-5 —— 那 20px 是"列表尾部到分隔线"的距离，跟着列表走，不该被这一行改掉。
          跟 Hotels / Trains 那两个是同一处样式，三处要改一起改。
        */}
        <Button
          variant="link"
          className="mt-2 text-sm text-gray-400 hover:text-gray-600 p-0 h-auto"
          onClick={openFlightDialog}
        >
          + 添加一个航班
        </Button>
      </ListShell>

      {/* 航班弹窗 */}
      <Dialog open={showFlightDialog} onOpenChange={setShowFlightDialog}>
        {/*
          sm:max-w-lg：默认的 max-w-sm（384px）塞两列表单，每列只剩 ~170px，
          日期按钮会被 truncate 截成「2024年9月…」。两种模式共用一个宽度，
          切换时弹窗宽度不会跳一下。
          max-h + overflow-y-auto 防止手动表单在矮窗口里超出屏幕；日期面板不会被它裁掉，
          因为 PopoverContent 走 Portal 挂在 body 上（components/ui/popover.tsx:26）。
        */}
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{manualMode ? "手动添加航班" : "添加航班"}</DialogTitle>
            {manualMode && (
              <Button
                type="button"
                variant="link"
                className="h-auto w-fit p-0 text-xs text-gray-500 hover:text-gray-800"
                onClick={() => setManualMode(false)}
              >
                <ArrowLeft className="size-3.5" />
                返回搜索
              </Button>
            )}
          </DialogHeader>

          {manualMode && (
            <div className="space-y-3 py-2">
              <FlightFormFields
                draft={manualDraft}
                onChange={setManualField}
                disabled={tripDisabled}
                fallbackMonth={dateRange?.from}
              />
              <p className="text-xs text-gray-400">
                机场从下拉里选中的话，出发/到达机场会各自加进当天行程（地图上也会出现）；
                完全手打、表里没有的机场挂不上，只留在这个 Flights 列表里。
              </p>
            </div>
          )}

          {/* 搜索面板（两个面板互斥，各判各的，省得整块重新缩进） */}
          {!manualMode && (
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="flightNumber">航班号</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  id="flightNumber"
                  placeholder="例如：CA1234 / MU5102"
                  className="uppercase flex-1"
                  value={flightQuery}
                  onChange={(e) => setFlightQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !flightSearching) searchFlight();
                  }}
                />
                <Button
                  variant="outline"
                  onClick={searchFlight}
                  disabled={!flightQuery.trim() || flightSearching}
                  className="shrink-0"
                >
                  {flightSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="ml-1">查询</span>
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                输入完整航班号，查询该航班的真实时刻与航线（国内航班）。查不到？
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

            {flightError && (
              <div className="flex items-center gap-1 text-sm">
                <span className="text-red-500">{flightError}</span>
                {/* 查不到是常态（免费层只回当天排班），这里给一条出路 */}
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

            {flightResult &&
              flightResult.departure.time &&
              flightResult.arrival.time && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-lg font-bold text-gray-900">
                        {format(
                          toBeijingDate(flightResult.departure.time),
                          "HH:mm"
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {flightResult.departure.city ?? flightResult.departure.code}
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="text-lg font-bold text-gray-900">
                        {format(toBeijingDate(flightResult.arrival.time), "HH:mm")}
                      </div>
                      <div className="text-sm text-gray-500">
                        {flightResult.arrival.city ?? flightResult.arrival.code}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {flightResult.airline} {flightResult.flightNumber} ·{" "}
                    {flightResult.departure.airport} →{" "}
                    {flightResult.arrival.airport}
                  </div>
                  <div>
                    <Label>出发日期（行程内）</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full mt-1 justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {flightDate ? (
                            format(flightDate, "yyyy年M月d日 EEE", { locale: zhCN })
                          ) : (
                            <span className="text-gray-500">选择出发日期</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={flightDate}
                          onSelect={setFlightDate}
                          disabled={tripDisabled}
                          defaultMonth={flightDate ?? dateRange?.from}
                          numberOfMonths={2}
                          locale={zhCN}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
          </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowFlightDialog(false)}>
              取消
            </Button>
            {/* 两种模式共用这个按钮，只有能不能点 / 点了做什么不同 */}
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              disabled={
                flightAdding ||
                (!manualMode && (!flightResult || !flightDate))
              }
              onClick={manualMode ? handleManualAdd : handleAddFlight}
            >
              {flightAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "添加航班"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
