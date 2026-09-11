/**
 * /api/flights 返回的"航班信息"类型。
 * 只做客户端展示 + 保存入库的数据源，机场信息已按国内映射表翻译成中文。
 */

/** 一段航程（出发 或 到达） */
export interface FlightLegApi {
  /** IATA 三字码，如 "PEK" */
  code: string;
  /** 中文城市名；机场不在国内映射表时为 null（由前端用 code 兜底展示） */
  city: string | null;
  /** 机场名（优先中文全称，缺失则用源数据里的英文名） */
  airport: string;
  /** 机场坐标（仅国内映射表内的机场有值） */
  lng: number | null;
  lat: number | null;
  /** 源数据返回的 scheduled 时刻（UTC ISO 字符串，展示时 +8 转北京时间） */
  time: string | null;
}

export interface FlightApiResult {
  flightNumber: string;
  airline: string;
  departure: FlightLegApi;
  arrival: FlightLegApi;
}
