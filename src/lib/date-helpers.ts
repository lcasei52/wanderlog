import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

/**
 * 根据日期字符串计算是行程的第几天（从 1 开始）
 * @param dateStr "2024-09-24"
 * @param tripStartDate "2024-09-20"
 * @returns 天数（1,2,3...）或 null（超出范围或无 trip 日期）
 */
export function getDayNumberFromDate(
  dateStr: string,
  tripStartDate: string | null
): number | null {
  if (!tripStartDate) return null;

  const start = new Date(tripStartDate);
  const target = new Date(dateStr);

  // 归零时间部分，只比较日期
  start.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return null; // 在行程开始前
  return diffDays + 1; // Day 1 从 0 天开始
}

/**
 * Date 对象 → "周四, 9月 24日" 格式（中文）
 */
export function formatDateDisplay(date: Date): string {
  return format(date, "EEEE, M月 d日", { locale: zhCN });
}

/**
 * ISO 日期字符串 → "周四, 9月 24日" 格式
 */
export function formatDateStringDisplay(dateStr: string): string {
  return formatDateDisplay(new Date(dateStr));
}

/**
 * ISO 时间戳 → "08:30" 格式（北京时间 UTC+8）
 * 假设输入已经是 +08:00 时区的时间字符串
 */
export function formatTimeDisplay(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  return format(date, "HH:mm");
}
