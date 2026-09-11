/**
 * 传给客户端组件用的行程快照（可序列化，对应 trips 表的主干字段）。
 * 列表 / 地点等明细本轮不落库，因此不在其中。
 */
export interface TripSummary {
  id: string;
  name: string;
  startDate: string | null; // "YYYY-MM-DD"
  endDate: string | null;
  destination?: {
    name: string;
    type: "city" | "province" | "country";
    location: { lng: number; lat: number };
  };
  coverImageUrl?: string | null; // 网络图片 URL
  coverImageData?: string | null; // 本地图片 base64
}
