"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import type { Train } from "@/db/schema";
import type { StationOption } from "@/types/train";
import { toComboOptions } from "@/lib/stations";
import { useStationSearch } from "@/hooks/useStationSearch";
import AirportCombobox, { type ComboOption } from "./AirportCombobox";
import { DateField, Field } from "./FormFields";

/**
 * 火车表单的共用部分：「编辑已有火车」（TrainCard 展开体）和「手动填写火车」
 * （TrainsList 弹窗里的手动模式）都用这 7 格，只有按钮和保存动作不同。
 *
 * 草稿里可空字段一律先落成 ""，输入框才好受控；落库前再还原成 null —— 那是给
 * **城市**那一对准备的（它们真的是可空列）。车次也允许是 ""，但它落库**就是空串**
 * （那一列是 notNull），别顺手给它也套上 stringOrNull。
 */
export interface TrainDraft {
  /** **可空**：只定了"这天坐火车去"、还没挑车次时留空，落库是空串 */
  trainNumber: string;
  fromStation: string;
  /** 上车站所在城市。**不是输入框** —— 从联想里选中站点时自动带出，手打的为 "" */
  fromCity: string;
  toStation: string;
  toCity: string;
  date: string; // "yyyy-MM-dd"，必填（上车站的乘车日）
  departureTime: string; // "HH:mm"
  arrivalDate: string; // "yyyy-MM-dd"，必填
  arrivalTime: string; // "HH:mm"
}

export function toDraft(t: Train): TrainDraft {
  return {
    trainNumber: t.trainNumber,
    fromStation: t.fromStation,
    fromCity: t.fromCity ?? "",
    toStation: t.toStation,
    toCity: t.toCity ?? "",
    date: t.date,
    departureTime: t.departureTime,
    arrivalDate: t.arrivalDate ?? "",
    arrivalTime: t.arrivalTime,
  };
}

/**
 * 空草稿。两个日期都给成传进来的那天（手动添加时是行程第一天）——
 * 国内车次绝大多数当天到，少点一次；用户把到达日期清空了照样会被 validateDraft 拦下。
 */
export function emptyDraft(date = ""): TrainDraft {
  return {
    trainNumber: "",
    fromStation: "",
    fromCity: "",
    toStation: "",
    toCity: "",
    date,
    departureTime: "",
    arrivalDate: date,
    arrivalTime: "",
  };
}

/**
 * 校验草稿，返回缺的那个字段的中文名；都齐了返回 null。
 *
 * 必填的是**两个站名和两个日期**。日期是因为留空会让 formatDateStringDisplay("")
 * 拿到 Invalid Date；站名同理 —— `from_station` / `to_station` 在库里就是 notNull，
 * 空着存不进去。
 *
 * **车次故意不是必填**：用户常常先定"这天要坐火车去"、车次还没挑好，先占个位再补。
 * 空着落库是空串（那一列也是 notNull，见 schema 的注释），卡片上就不显示那一行，
 * 之后在卡片里填上就回来了 —— 所以编辑那条路也走同一个 validateDraft，不需要开关。
 *
 * 航班那个 validateDraft 有个 `requireCities` 开关（新增时才要求城市非空），
 * **这里不需要**：火车的城市恰恰是**可空**的那一对（见 schema 的注释），两条路都不要求，
 * 它是选中站点时自动带出来的副产品。所以别照抄那个开关，抄过来是个永远传 true 的死参数。
 */
export function validateDraft(draft: TrainDraft): string | null {
  if (!draft.fromStation.trim()) return "出发站";
  if (!draft.toStation.trim()) return "到达站";
  if (!draft.date) return "出发日期";
  if (!draft.arrivalDate) return "到达日期";
  return null;
}

/**
 * 7 格表单本体：车次，出发/到达的站名、日期、时刻。
 *
 * 站名走高德联想（用户拍板的），但**联想只是加速器**：高德没配 key、或者查不到，
 * 手打照样能存（只是没有城市和坐标，站点卡挂得上但地图上没位置）。
 *
 * 城市不单独给输入框：它是"这个站在哪个城市"，站名一确定它就没有第二种答案。
 */
export default function TrainFormFields({
  draft,
  onChange,
  disabled,
  fallbackMonth,
  onStationPick,
}: {
  draft: TrainDraft;
  onChange: <K extends keyof TrainDraft>(key: K, value: TrainDraft[K]) => void;
  /**
   * 行程日期范围，只用来限制**出发日期**（它决定上车站那张卡挂在哪天）。
   * 到达日期不限制 —— 跨夜车的到达日就是会在行程之外，理由见下面那个 Field。
   */
  disabled?: { before: Date; after: Date };
  /** 没选日期时日历打开到哪个月 */
  fallbackMonth?: Date;
  /**
   * 从联想里选中站点时把整条 `StationOption` 抛给调用方。
   *
   * 为什么需要它：城市还能塞进 draft，但**坐标不能** —— 草稿刻意只有 DB 行的形状，
   * 而坐标不进 trains 表（它是给自动挂出来的站点卡用的，见 schema 的注释）。
   * 所以弹窗自己拿个小 Map 暂存，提交时按两站取。TrainCard 的编辑表单不传它。
   */
  onStationPick?: (leg: "from" | "to", station: StationOption) => void;
}) {
  const fromSearch = useStationSearch(draft.fromStation);
  const toSearch = useStationSearch(draft.toStation);

  const fromOptions = useMemo(
    () => toComboOptions(fromSearch.options),
    [fromSearch.options],
  );
  const toOptions = useMemo(
    () => toComboOptions(toSearch.options),
    [toSearch.options],
  );
  // 按站名反查那条完整记录 —— ComboOption 只有名字，坐标和城市在 StationOption 上
  const fromByName = useMemo(
    () => new Map(fromSearch.options.map((s) => [s.name, s])),
    [fromSearch.options],
  );
  const toByName = useMemo(
    () => new Map(toSearch.options.map((s) => [s.name, s])),
    [toSearch.options],
  );

  // 两条腿逻辑一样，分开写两遍是为了键名能定死成字面量（同 FlightFormFields）
  const pickFromStation = (o: ComboOption) => {
    const station = fromByName.get(o.value);
    if (!station) return;
    onChange("fromStation", station.name);
    onChange("fromCity", station.city ?? "");
    onStationPick?.("from", station);
  };
  const pickToStation = (o: ComboOption) => {
    const station = toByName.get(o.value);
    if (!station) return;
    onChange("toStation", station.name);
    onChange("toCity", station.city ?? "");
    onStationPick?.("to", station);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* 左列 = 坐哪趟车、哪两个站；右列 = 什么时候。左右各读下来都成句 */}
      {/* 车次**可以留空**（还没挑好车次、先占位的场景），所以标签上明写"可选" */}
      <Field label="车次（可选）">
        <Input
          value={draft.trainNumber}
          onChange={(e) => onChange("trainNumber", e.target.value)}
          placeholder="如：G1030"
          className="h-8 uppercase"
        />
      </Field>
      <Field label="出发日期">
        <DateField
          value={draft.date}
          onChange={(v) => onChange("date", v)}
          disabled={disabled}
          fallbackMonth={fallbackMonth}
        />
      </Field>

      <Field label="出发站">
        <AirportCombobox
          value={draft.fromStation}
          // 手打只清城市：人还在敲，别把他选好的东西抹掉
          onChange={(v) => {
            onChange("fromStation", v);
            onChange("fromCity", "");
          }}
          onPick={pickFromStation}
          options={fromOptions}
          heading="匹配的车站"
          placeholder="搜索站名"
        />
        {fromSearch.unavailable && <HintUnavailable />}
      </Field>
      <Field label="出发时刻">
        <Input
          type="time"
          value={draft.departureTime}
          onChange={(e) => onChange("departureTime", e.target.value)}
          className="h-8"
        />
      </Field>

      <Field label="到达站">
        <AirportCombobox
          value={draft.toStation}
          onChange={(v) => {
            onChange("toStation", v);
            onChange("toCity", "");
          }}
          onPick={pickToStation}
          options={toOptions}
          heading="匹配的车站"
          placeholder="搜索站名"
        />
        {toSearch.unavailable && <HintUnavailable />}
      </Field>
      <Field label="到达日期">
        {/*
          **故意不传 disabled**（出发日期传了）。跨夜车的到达日是行程最后一天的次日，
          按行程范围禁掉的话，最后一晚那趟 Z/K 字头根本选不出来 —— 而"跨夜"正是这套
          东西要支持的头等场景。放开之后代价只是"用户可以填一个离谱的到达日"，
          卡片上那个「+N天」标记会立刻把它显出来，比禁掉一个合法选项划算。
        */}
        <DateField
          value={draft.arrivalDate}
          onChange={(v) => onChange("arrivalDate", v)}
          fallbackMonth={fallbackMonth}
        />
      </Field>

      <Field label="到达时刻">
        <Input
          type="time"
          value={draft.arrivalTime}
          onChange={(e) => onChange("arrivalTime", e.target.value)}
          className="h-8"
        />
      </Field>
    </div>
  );
}

/**
 * 联想这条路走不通时的一行小字。
 * 必须说出来：否则用户打了"宜昌北"看着空下拉，会以为"没这个站"，而实际是能直接存的
 * （手填是主路径，联想只是加速器）。
 */
function HintUnavailable() {
  return (
    <p className="text-[11px] text-gray-400">
      站点联想暂时不可用，直接输入站名即可
    </p>
  );
}
