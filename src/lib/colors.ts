/**
 * 预定义的颜色列表，用于不同的地点列表
 * 每个列表（天数/自定义列表）会被分配一个唯一的颜色
 */
export const LIST_COLORS = [
  "#FF6B6B", // 红色
  "#4ECDC4", // 青色
  "#45B7D1", // 蓝色
  "#FFA07A", // 橙色
  "#98D8C8", // 薄荷绿
  "#F7DC6F", // 黄色
  "#BB8FCE", // 紫色
  "#85C1E2", // 天蓝色
  "#F8B500", // 琥珀色
  "#52B788", // 绿色
  "#E63946", // 深红色
  "#06FFA5", // 荧光绿
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
