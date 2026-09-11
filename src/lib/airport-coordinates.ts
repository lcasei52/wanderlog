/**
 * 国内主要机场代码 → 坐标 + 中文名称 + 城市 映射表
 * 覆盖各省会及重点城市机场。查不到 = 国际/小众机场，功能优雅降级。
 */
export interface AirportInfo {
  lng: number;
  lat: number;
  /** 机场全称（如 "北京首都国际机场"） */
  name: string;
  /** 所在城市（如 "北京"） */
  city: string;
}

export const AIRPORT_COORDS: Record<string, AirportInfo> = {
  // 北京
  PEK: { lng: 116.584556, lat: 40.080111, name: "北京首都国际机场", city: "北京" },
  PKX: { lng: 116.255656, lat: 39.509945, name: "北京大兴国际机场", city: "北京" },

  // 上海
  PVG: { lng: 121.805214, lat: 31.143378, name: "上海浦东国际机场", city: "上海" },
  SHA: { lng: 121.336319, lat: 31.197875, name: "上海虹桥国际机场", city: "上海" },

  // 广东
  CAN: { lng: 113.298786, lat: 23.392436, name: "广州白云国际机场", city: "广州" },
  SZX: { lng: 113.810664, lat: 22.639444, name: "深圳宝安国际机场", city: "深圳" },

  // 四川
  CTU: { lng: 103.947086, lat: 30.578528, name: "成都双流国际机场", city: "成都" },
  TFU: { lng: 104.445304, lat: 30.308611, name: "成都天府国际机场", city: "成都" },

  // 陕西
  XIY: { lng: 108.751592, lat: 34.447119, name: "西安咸阳国际机场", city: "西安" },

  // 湖北
  WUH: { lng: 114.208333, lat: 30.783758, name: "武汉天河国际机场", city: "武汉" },

  // 重庆
  CKG: { lng: 106.641678, lat: 29.719217, name: "重庆江北国际机场", city: "重庆" },

  // 云南
  KMG: { lng: 102.929058, lat: 25.101556, name: "昆明长水国际机场", city: "昆明" },

  // 福建
  FOC: { lng: 119.663272, lat: 25.935064, name: "福州长乐国际机场", city: "福州" },
  XMN: { lng: 118.127739, lat: 24.544036, name: "厦门高崎国际机场", city: "厦门" },

  // 浙江
  HGH: { lng: 120.434453, lat: 30.229503, name: "杭州萧山国际机场", city: "杭州" },
  NGB: { lng: 121.462151, lat: 29.826769, name: "宁波栎社国际机场", city: "宁波" },
  WNZ: { lng: 120.851971, lat: 27.912218, name: "温州龙湾国际机场", city: "温州" },

  // 江苏
  NKG: { lng: 118.862025, lat: 31.742042, name: "南京禄口国际机场", city: "南京" },
  WUX: { lng: 120.42945, lat: 31.494431, name: "苏南硕放国际机场", city: "无锡" },

  // 湖南
  CSX: { lng: 113.219633, lat: 28.189158, name: "长沙黄花国际机场", city: "长沙" },

  // 河南
  CGO: { lng: 113.840889, lat: 34.519672, name: "郑州新郑国际机场", city: "郑州" },

  // 山东
  TAO: { lng: 120.374389, lat: 36.266108, name: "青岛胶东国际机场", city: "青岛" },
  TNA: { lng: 117.216028, lat: 36.857214, name: "济南遥墙国际机场", city: "济南" },
  YNT: { lng: 121.37094, lat: 37.659443, name: "烟台蓬莱国际机场", city: "烟台" },

  // 辽宁
  DLC: { lng: 121.538611, lat: 38.965667, name: "大连周水子国际机场", city: "大连" },
  SHE: { lng: 123.483225, lat: 41.639751, name: "沈阳桃仙国际机场", city: "沈阳" },

  // 吉林
  CGQ: { lng: 125.684764, lat: 43.996214, name: "长春龙嘉国际机场", city: "长春" },

  // 黑龙江
  HRB: { lng: 126.250283, lat: 45.623403, name: "哈尔滨太平国际机场", city: "哈尔滨" },

  // 天津
  TSN: { lng: 117.346183, lat: 39.124353, name: "天津滨海国际机场", city: "天津" },

  // 河北
  SJW: { lng: 114.696689, lat: 38.280686, name: "石家庄正定国际机场", city: "石家庄" },

  // 山西
  TYN: { lng: 112.628103, lat: 37.746817, name: "太原武宿国际机场", city: "太原" },

  // 内蒙古
  HET: { lng: 111.824103, lat: 40.851422, name: "呼和浩特白塔国际机场", city: "呼和浩特" },

  // 广西
  NNG: { lng: 108.172442, lat: 22.608267, name: "南宁吴圩国际机场", city: "南宁" },

  // 海南
  HAK: { lng: 110.458961, lat: 19.934856, name: "海口美兰国际机场", city: "海口" },
  SYX: { lng: 109.412272, lat: 18.302897, name: "三亚凤凰国际机场", city: "三亚" },

  // 贵州
  KWE: { lng: 106.800703, lat: 26.538522, name: "贵阳龙洞堡国际机场", city: "贵阳" },

  // 西藏
  LXA: { lng: 90.911944, lat: 29.297778, name: "拉萨贡嘎国际机场", city: "拉萨" },

  // 青海
  XNN: { lng: 102.043336, lat: 36.527539, name: "西宁曹家堡国际机场", city: "西宁" },

  // 宁夏
  INC: { lng: 106.389183, lat: 38.481944, name: "银川河东国际机场", city: "银川" },

  // 甘肃
  LHW: { lng: 103.620639, lat: 36.515242, name: "兰州中川国际机场", city: "兰州" },

  // 新疆
  URC: { lng: 87.474244, lat: 43.907106, name: "乌鲁木齐地窝堡国际机场", city: "乌鲁木齐" },

  // 安徽
  HFE: { lng: 117.298267, lat: 31.780019, name: "合肥新桥国际机场", city: "合肥" },

  // 江西
  KHN: { lng: 115.900017, lat: 28.864892, name: "南昌昌北国际机场", city: "南昌" },
};

/**
 * 根据 IATA 机场代码获取机场信息
 * @param iataCode 三字码（如 "PEK"）
 * @returns 机场信息（坐标/名称/城市）或 null（不在映射表中）
 */
export function getAirportInfo(iataCode: string): AirportInfo | null {
  return AIRPORT_COORDS[iataCode.toUpperCase()] || null;
}
