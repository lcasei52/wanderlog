/**
 * /api/trains 和 /api/stations 返回的类型。
 *
 * 时刻一律是**北京时间**，全链路不做时区换算 —— 跟 types/flight.ts 那边正好相反
 * （AviationStack 回的是 UTC，客户端要 +8）。12306 只服务国内，它给的 "HH:mm"
 * 就是票面上的时刻，直接存。
 */

/** 12306 按车次搜出来的一条候选（keyword 是前缀匹配，一次会回好几条） */
export interface TrainSearchItem {
  /** 车次，如 "G1030" */
  trainNumber: string;
  /** 12306 内部的列车编号（如 "7b000G103002"）—— 查经停表**必须**带它，光有车次串不够 */
  trainNo: string;
  /** 始发站名 */
  fromStation: string;
  /** 终到站名 */
  toStation: string;
}

/** 一个经停站 */
export interface TrainStop {
  stationName: string;
  /** 站点序号，1 起 */
  stationNo: number;
  /** "HH:mm"；始发站没有到达时刻（12306 回字面量 "----"）→ null */
  arriveTime: string | null;
  /** "HH:mm"；终到站没有发车时刻（同上）→ null */
  startTime: string | null;
  /**
   * 相对**始发站发车日**的天数偏移，跨 0 点 +1。
   *
   * 12306 只给 "HH:mm" 不给日期，跨夜车（Z/K 字头）得靠这个自己推。上下车站各取
   * 一个偏移、相减，就是"这趟车坐几天" —— 与"谁是始发站"无关，中途上车也对。
   */
  dayOffset: number;
}

/**
 * 高德联想出来的一个火车站。
 *
 * 站点卡（自动挂到当天的那张地点卡）和火车行都用这里的 name —— 用户拍板"统一用高德
 * 全称"，所以自动填那条路上，预览里显示 12306 的写法（"宜昌北"），落到库里和卡片上的
 * 是"宜昌北站"。
 */
export interface StationOption {
  /** 高德 POI id，作站点卡的 groupKey 用；没有就退化成站名 */
  id: string;
  /** 站名全称，如 "宜昌北站" */
  name: string;
  /** 所在城市，如 "宜昌"（已去掉 cityname 尾部的「市」，与 trips.destination_name 一致） */
  city: string | null;
  lng: number | null;
  lat: number | null;
}
