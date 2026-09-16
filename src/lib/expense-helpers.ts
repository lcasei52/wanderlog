import { format } from "date-fns";
import { BedDouble, MapPin, Plane, type LucideIcon } from "lucide-react";
import type { Expense, ExpenseCategory } from "@/types/expense";
import type { Flight, Hotel, PlaceItem } from "@/db/schema";

/**
 * 「从您的行程中选择」那一行左边那个图标：按**项目类型**来，不是按费用类别。
 *
 * 参照物就是这三态（航班→飞机、地点→定位、住宿→床），而我们本来就有这个信息
 * （PickableItem.linkedItemType 就是 place/flight/hotel 三选一），不用推断。
 *
 * 为什么不按费用类别：地点在 inferFromPlace 里一律推断成「门票」，清单里两个
 * 不同地点会长得一模一样 —— 图标本来是用来"一眼分辨"的，这样反而帮倒忙。
 */
export function itemTypeIcon(type: PickableItem["linkedItemType"]): LucideIcon {
  if (type === "flight") return Plane;
  if (type === "hotel") return BedDouble;
  return MapPin;
}

/** "YYYY-MM-DD" → "9月15日"；空值/坏值返回 null 让调用方决定显示什么 */
export function formatExpenseDate(date: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "M月d日");
}

/** 项目类型 → 费用类别。费用名也一并定下来，省得调用方再拼一次 */
export interface ExpenseSeed {
  name: string;
  category: ExpenseCategory;
}

/**
 * 从行程项目推断费用名和类别。
 *
 * 地点实例要分两种：机场/酒店是随航班住宿自动挂上去的，它们本身不是"门票"，
 * 挂了航班就该记成航班开销。靠 sourceKind 区分（见 FlightsList.addAirportItem）。
 */
export function inferFromFlight(flight: Flight): ExpenseSeed {
  const route = `${flight.from}-${flight.to}`;
  return {
    name: flight.flightNumber ? `${route} ${flight.flightNumber}` : `${route} 航班`,
    category: "航班",
  };
}

export function inferFromHotel(hotel: Hotel): ExpenseSeed {
  return { name: hotel.name, category: "住宿" };
}

export function inferFromPlace(item: PlaceItem): ExpenseSeed {
  if (item.sourceKind === "flight") return { name: item.name, category: "航班" };
  if (item.sourceKind === "hotel") return { name: item.name, category: "住宿" };
  return { name: item.name, category: "门票" };
}

/**
 * 「选择项目」里可选的一项：行程里的地点 / 航班 / 住宿，统一成这个形状，
 * 列表和搜索框都只认它。选中后既带出费用名和类别，也记下关联（linkedItemType/Id）。
 */
export interface PickableItem {
  /** React key，同时用于判断"是不是当前选中的那项" */
  key: string;
  name: string;
  category: ExpenseCategory;
  /**
   * 「来自哪里」：清单标题，或者 "Day 1 · 9月18日"。显示在名字那一行最右边。
   *
   * 存在的理由是**同名但不同容器的两份实例**：同一个地点可以同时在清单里和某一天里，
   * 那是 place_items 的两行，名字一模一样。不去重的话必须有个东西把它们区分开，
   * 否则屏幕上就是两个「武汉大学」。
   */
  origin: string;
  /**
   * 选中后要预填的日期。地点取它所在那天的日子（在清单里的为 null），
   * 航班取出发日、住宿取入住日。
   *
   * **这一项是"从预算里选一个项目"和"在项目卡片上点添加费用"两条路唯一的差别。**
   * 卡片那条路会把 dayDate 预填进去（见 PlaceCard 的 prefill），所以费用自动落在
   * 当天；少了它，账能记下但不属于任何一天，在当天列表和日期排序里都看不到。
   */
  date: string | null;
  linkedItemType: "place" | "flight" | "hotel";
  linkedItemId: string;
}

/** 费用列表的排序方式（「费用」小标题右边那个下拉） */
export type ExpenseSortKey =
  | "date-desc"
  | "date-asc"
  | "amount-desc"
  | "amount-asc"
  | "category";

export const EXPENSE_SORT_LABELS: Record<ExpenseSortKey, string> = {
  "date-desc": "日期（最新）",
  "date-asc": "日期（最旧）",
  "amount-desc": "金额（从高到低）",
  "amount-asc": "金额（从低到高）",
  category: "按类别",
};

/**
 * 排序用的时间戳。date 是可选的，没填就退回 createdAt ——
 * 否则「日期最新」下这些费用会全被排到最前面或最后面，看着像 bug。
 */
function timeOf(exp: Expense): number {
  if (exp.date) return new Date(`${exp.date}T00:00:00`).getTime();
  return new Date(exp.createdAt).getTime();
}

export function sortExpenses(expenses: Expense[], key: ExpenseSortKey): Expense[] {
  const sorted = [...expenses];
  switch (key) {
    case "date-desc":
      return sorted.sort((a, b) => timeOf(b) - timeOf(a));
    case "date-asc":
      return sorted.sort((a, b) => timeOf(a) - timeOf(b));
    case "amount-desc":
      return sorted.sort((a, b) => b.amount - a.amount);
    case "amount-asc":
      return sorted.sort((a, b) => a.amount - b.amount);
    case "category":
      // 同类别内按日期由新到旧，否则同类里的顺序是随机的
      return sorted.sort(
        (a, b) => a.category.localeCompare(b.category, "zh-CN") || timeOf(b) - timeOf(a),
      );
  }
}
