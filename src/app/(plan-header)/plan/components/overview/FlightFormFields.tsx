"use client";

import { useMemo, type ReactNode } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, parse } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Flight } from "@/db/schema";
import AirportCombobox, { type ComboOption } from "./AirportCombobox";
import {
  AIRPORT_CITIES,
  AIRPORT_LIST,
  getAirportByName,
  type AirportEntry,
} from "@/lib/airport-coordinates";

/**
 * 航班编辑表单的共用部分：「编辑已有航班」（FlightCard 展开体）和
 * 「手动添加航班」（FlightsList 弹窗）都用这 10 格，只有按钮和保存动作不同。
 *
 * 草稿里可空字段一律先落成 ""，输入框才好受控；落库前再还原成 null。
 */
export interface FlightDraft {
  flightNumber: string;
  airline: string;
  from: string;
  fromCity: string;
  fromCode: string; // 三字码；只有从下拉里选中才有，手打的为 ""
  date: string; // "yyyy-MM-dd"，必填
  departureTime: string; // "HH:mm"
  to: string;
  toCity: string;
  toCode: string; // 同上
  arrivalDate: string; // "yyyy-MM-dd"，可空
  arrivalTime: string; // "HH:mm"
}

/**
 * 老行没存三字码（列是后加的），但 from_city 里存的就是机场全称，
 * 能反查出来补上 —— 这样展开编辑再保存，老数据也把码补齐了。
 */
function codeOf(stored: string | null, airportName: string): string {
  if (stored) return stored;
  return getAirportByName(airportName)?.code ?? "";
}

export function toDraft(f: Flight): FlightDraft {
  return {
    flightNumber: f.flightNumber,
    airline: f.airline ?? "",
    from: f.from,
    fromCity: f.fromCity,
    fromCode: codeOf(f.fromCode, f.fromCity),
    date: f.date,
    departureTime: f.departureTime,
    to: f.to,
    toCity: f.toCity,
    toCode: codeOf(f.toCode, f.toCity),
    arrivalDate: f.arrivalDate ?? "",
    arrivalTime: f.arrivalTime,
  };
}

/** 空草稿。date 可传入（手动添加时默认落在行程第一天） */
export function emptyDraft(date = ""): FlightDraft {
  return {
    flightNumber: "",
    airline: "",
    from: "",
    fromCity: "",
    fromCode: "",
    date,
    departureTime: "",
    to: "",
    toCity: "",
    toCode: "",
    arrivalDate: "",
    arrivalTime: "",
  };
}

/**
 * 校验草稿，返回缺的那个字段的中文名；都齐了返回 null。
 * 日期留空会让 formatDateStringDisplay("") 拿到 Invalid Date，所以日期必填。
 *
 * requireCities：手动**新增**时要求城市非空 —— 城市是卡片的主体，空着卡片就没意义了；
 *                编辑已有航班时不管（行已经在库里了，允许暂时不完整）。
 */
export function validateDraft(
  draft: FlightDraft,
  opts?: { requireCities?: boolean }
): string | null {
  if (!draft.flightNumber.trim()) return "航班号";
  if (!draft.date) return "出发日期";
  if (opts?.requireCities) {
    if (!draft.from.trim()) return "出发城市";
    if (!draft.to.trim()) return "到达城市";
  }
  return null;
}

/* ---------- 下拉数据源 ---------- */

/** 机场条目上多带一个 city，用于按当前城市筛 */
type AirportOption = ComboOption & { city: string };

const AIRPORT_OPTIONS: AirportOption[] = AIRPORT_LIST.map((a) => ({
  value: a.name,
  label: a.name,
  hint: `${a.city} · ${a.code}`,
  city: a.city,
}));

const KNOWN_CITIES = new Set(AIRPORT_CITIES);

/** 城市 → 该城市的全部三字码（「北京」→ "PEK · PKX"） */
const CITY_OPTIONS: ComboOption[] = (() => {
  const codes = new Map<string, string[]>();
  for (const a of AIRPORT_LIST) {
    const list = codes.get(a.city);
    if (list) list.push(a.code);
    else codes.set(a.city, [a.code]);
  }
  return AIRPORT_CITIES.map((city) => ({
    value: city,
    label: city,
    hint: (codes.get(city) ?? []).join(" · "),
  }));
})();

/**
 * 城市认得出就**只列它的机场** —— 城市和机场本来就该是一对，定死了城市还挂着
 * 另外两百多条是噪音。反过来，城市认不出（没填、境外、表外城市）就列全部，
 * 这时靠搜索词收敛。
 *
 * 手打始终不受限制：写什么存什么，只是拿不到三字码。
 */
function airportsOfCity(city: string): AirportOption[] {
  const c = city.trim();
  if (!c) return AIRPORT_OPTIONS;
  const mine = AIRPORT_OPTIONS.filter((o) => o.city === c);
  return mine.length > 0 ? mine : AIRPORT_OPTIONS;
}

/**
 * 这个城市只有一个机场时返回它（西安、厦门这类）—— 城市一选定就顺手填上，
 * 少点一次。两个以上就留给用户挑，不猜。
 */
function soleAirportOf(city: string): AirportEntry | null {
  const c = city.trim();
  if (!KNOWN_CITIES.has(c)) return null;
  const mine = AIRPORT_LIST.filter((a) => a.city === c);
  return mine.length === 1 ? mine[0] : null;
}

/** 表单里的一格：小标签 + 控件 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-normal text-gray-500">{label}</Label>
      {children}
    </div>
  );
}

/**
 * "yyyy-MM-dd" 字符串 ⇄ Date 的日期选择器（行程范围内可选）。
 * 必须走 date-fns 的 parse：new Date("2024-09-24") 是按 UTC 解析的，
 * 时区一偏就整天错位；parse 按本地时区，取回来还是同一天。
 */
function DateField({
  value,
  onChange,
  disabled,
  fallbackMonth,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: { before: Date; after: Date };
  fallbackMonth?: Date;
}) {
  const selected = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-gray-400"
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {selected
              ? format(selected, "yyyy年M月d日", { locale: zhCN })
              : "选择日期"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : "")}
          disabled={disabled}
          defaultMonth={selected ?? fallbackMonth}
          numberOfMonths={2}
          locale={zhCN}
        />
      </PopoverContent>
    </Popover>
  );
}

/** 10 格表单本体：航班号/航司、出发与到达的城市·机场·日期·时刻 */
export default function FlightFormFields({
  draft,
  onChange,
  disabled,
  fallbackMonth,
}: {
  draft: FlightDraft;
  onChange: <K extends keyof FlightDraft>(key: K, value: FlightDraft[K]) => void;
  /** 行程日期范围，用于限制两个日期选择器 */
  disabled?: { before: Date; after: Date };
  /** 没选日期时日历打开到哪个月 */
  fallbackMonth?: Date;
}) {
  const fromAirports = useMemo(() => airportsOfCity(draft.from), [draft.from]);
  const toAirports = useMemo(() => airportsOfCity(draft.to), [draft.to]);
  // 只列本市机场时标一行小标题，免得看着像数据缺了
  const fromCityName = draft.from.trim();
  const toCityName = draft.to.trim();
  const fromHeading = KNOWN_CITIES.has(fromCityName)
    ? `${fromCityName}的机场`
    : undefined;
  const toHeading = KNOWN_CITIES.has(toCityName)
    ? `${toCityName}的机场`
    : undefined;

  // 城市与机场的联动。两条腿（from/to）逻辑一样，分开写两遍是为了键名能定死成字面量。
  const pickFromCity = (o: ComboOption) => {
    onChange("from", o.value);
    const only = soleAirportOf(o.value);
    if (only) {
      // 全城就这一个机场，没什么可挑的
      onChange("fromCity", only.name);
      onChange("fromCode", only.code);
      return;
    }
    onChange("fromCity", ""); // 城市换人了，旧机场肯定不对
    onChange("fromCode", "");
  };
  const pickFromAirport = (o: ComboOption) => {
    const a = getAirportByName(o.value);
    if (!a) return;
    onChange("from", a.city);
    onChange("fromCity", a.name);
    onChange("fromCode", a.code);
  };
  const pickToCity = (o: ComboOption) => {
    onChange("to", o.value);
    const only = soleAirportOf(o.value);
    if (only) {
      onChange("toCity", only.name);
      onChange("toCode", only.code);
      return;
    }
    onChange("toCity", "");
    onChange("toCode", "");
  };
  const pickToAirport = (o: ComboOption) => {
    const a = getAirportByName(o.value);
    if (!a) return;
    onChange("to", a.city);
    onChange("toCity", a.name);
    onChange("toCode", a.code);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="航班号">
        <Input
          value={draft.flightNumber}
          onChange={(e) => onChange("flightNumber", e.target.value)}
          className="h-8 uppercase"
        />
      </Field>
      <Field label="航司">
        <Input
          value={draft.airline}
          onChange={(e) => onChange("airline", e.target.value)}
          placeholder="如：中国国航"
          className="h-8"
        />
      </Field>

      <Field label="出发城市">
        <AirportCombobox
          value={draft.from}
          // 手打城市只清三字码：人还在敲，别把他填好的机场名抹掉
          onChange={(v) => {
            onChange("from", v);
            onChange("fromCode", "");
          }}
          onPick={pickFromCity}
          options={CITY_OPTIONS}
          placeholder="如：北京"
        />
      </Field>
      <Field label="出发机场">
        <AirportCombobox
          value={draft.fromCity}
          onChange={(v) => {
            onChange("fromCity", v);
            onChange("fromCode", "");
          }}
          onPick={pickFromAirport}
          options={fromAirports}
          heading={fromHeading}
          placeholder="搜索机场名或三字码"
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
      <Field label="出发时刻">
        <Input
          type="time"
          value={draft.departureTime}
          onChange={(e) => onChange("departureTime", e.target.value)}
          className="h-8"
        />
      </Field>

      <Field label="到达城市">
        <AirportCombobox
          value={draft.to}
          onChange={(v) => {
            onChange("to", v);
            onChange("toCode", "");
          }}
          onPick={pickToCity}
          options={CITY_OPTIONS}
          placeholder="如：上海"
        />
      </Field>
      <Field label="到达机场">
        <AirportCombobox
          value={draft.toCity}
          onChange={(v) => {
            onChange("toCity", v);
            onChange("toCode", "");
          }}
          onPick={pickToAirport}
          options={toAirports}
          heading={toHeading}
          placeholder="搜索机场名或三字码"
        />
      </Field>

      <Field label="到达日期">
        <DateField
          value={draft.arrivalDate}
          onChange={(v) => onChange("arrivalDate", v)}
          disabled={disabled}
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
