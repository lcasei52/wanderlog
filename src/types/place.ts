/**
 * 地点信息
 */
export interface Place {
  id: string;
  name: string;
  address?: string;
  location?: {
    lng: number;
    lat: number;
  };
}

/**
 * 带列表信息的地点（用于地图显示）
 */
export interface PlaceWithList extends Place {
  listId: string; // 所属列表的 ID（如 "day-1", "list-places-to-visit"）
  listType: "day" | "overview"; // 列表类型
  displayIndex: number; // 在列表中的显示索引（用于标记编号）
}
