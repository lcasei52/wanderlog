/**
 * 预定义的颜色列表，用于不同的地点列表
 * 每个列表（天数/自定义列表）会被分配一个唯一的颜色
 */
export const LIST_COLORS = [
  "#F87171", // rose-400
  "#FB923C", // orange-400
  "#FBBF24", // amber-400
  "#34D399", // emerald-400
  "#2DD4BF", // teal-400
  "#38BDF8", // sky-400
  "#818CF8", // indigo-400
  "#C084FC", // purple-400
  "#F472B6", // pink-400
  "#4ADE80", // green-400
  "#22D3EE", // cyan-400
  "#A78BFA", // violet-400
];

/**
 * 根据索引获取颜色
 * @param index - 列表索引
 * @returns 颜色值（十六进制）
 */
export function getColorByIndex(index: number): string {
  return LIST_COLORS[index % LIST_COLORS.length];
}

/**
 * 根据列表 ID 生成颜色
 * @param listId - 列表 ID（如 "day-1", "list-places-to-visit"）
 * @returns 颜色值（十六进制）
 */
export function getColorByListId(listId: string): string {
  // 简单的哈希函数，将字符串转换为数字
  let hash = 0;
  for (let i = 0; i < listId.length; i++) {
    hash = listId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % LIST_COLORS.length;
  return LIST_COLORS[index];
}
