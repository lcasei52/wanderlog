/**
 * 国内机场代码 → 坐标 + 中文名称 + 城市 映射表
 *
 * 数据来源：
 *  - `iata_code` / 经纬度 / 省份：OurAirports（公共领域，每日更新）
 *  - 中文机场名 / 中文城市名：Wikidata（P238 三字码 + P17 国家；城市走 P131 行政链）
 * 覆盖「有定期航班的大/中型机场」共 225 个。查不到 = 国际/小众机场，功能优雅降级。
 *
 * 注意：Wikidata 的中文 label 偶有过时（如 TAO 仍写「青岛流亭」，
 * 而实际已转场胶东），所以少数条目以人工校订值为准。
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

  // 天津
  TSN: { lng: 117.346183, lat: 39.124353, name: "天津滨海国际机场", city: "天津" },

  // 重庆
  CKG: { lng: 106.641678, lat: 29.719217, name: "重庆江北国际机场", city: "重庆" },
  CQW: { lng: 107.693664, lat: 29.465658, name: "武隆仙女山机场", city: "重庆" },
  JIQ: { lng: 108.831111, lat: 29.513333, name: "黔江武陵山机场", city: "重庆" },

  // 河北
  CDE: { lng: 118.073889, lat: 41.1225, name: "承德机场", city: "承德" },
  HDG: { lng: 114.424126, lat: 36.524824, name: "邯郸机场", city: "邯郸" },
  BPE: { lng: 119.061384, lat: 39.666384, name: "秦皇岛北戴河机场", city: "秦皇岛" },
  SJW: { lng: 114.696689, lat: 38.280686, name: "石家庄正定国际机场", city: "石家庄" },
  ZQZ: { lng: 114.933395, lat: 40.738664, name: "张家口宁远机场", city: "张家口" },

  // 山西
  DAT: { lng: 113.480509, lat: 40.06139, name: "大同云冈国际机场", city: "大同" },
  LFQ: { lng: 111.641236, lat: 36.132629, name: "临汾乔李机场", city: "临汾" },
  LLV: { lng: 111.142778, lat: 37.683333, name: "吕梁机场", city: "吕梁" },
  SZH: { lng: 112.691552, lat: 39.273241, name: "朔州滋润机场", city: "朔州" },
  TYN: { lng: 112.628103, lat: 37.746817, name: "太原武宿国际机场", city: "太原" },
  YCU: { lng: 111.034023, lat: 35.117823, name: "运城盐湖国际机场", city: "运城" },

  // 内蒙古
  YIE: { lng: 119.9117, lat: 47.3106, name: "阿尔山伊尔施机场", city: "阿尔山" },
  AXF: { lng: 105.58416, lat: 38.748317, name: "阿拉善左旗巴彦浩特机场", city: "阿拉善左旗" },
  RLK: { lng: 107.74093, lat: 40.926358, name: "巴彦淖尔天吉泰机场", city: "巴彦淖尔" },
  BAV: { lng: 109.997002, lat: 40.560001, name: "包头东河机场", city: "包头" },
  CIF: { lng: 118.840971, lat: 42.159723, name: "赤峰机场", city: "赤峰" },
  DSN: { lng: 109.8599, lat: 39.493514, name: "鄂尔多斯机场", city: "鄂尔多斯" },
  ERL: { lng: 112.091081, lat: 43.424079, name: "二连浩特赛乌苏国际机场", city: "二连浩特" },
  HET: { lng: 111.824103, lat: 40.851422, name: "呼和浩特白塔国际机场", city: "呼和浩特" },
  HLD: { lng: 119.822301, lat: 49.208616, name: "呼伦贝尔海拉尔机场", city: "呼伦贝尔" },
  HUO: { lng: 119.407222, lat: 45.487222, name: "霍林郭勒霍林河机场", city: "霍林郭勒" },
  NZH: { lng: 117.33, lat: 49.566667, name: "满洲里西郊机场", city: "满洲里" },
  TGO: { lng: 122.199997, lat: 43.556702, name: "通辽机场", city: "通辽" },
  WUA: { lng: 106.7993, lat: 39.7934, name: "乌海机场", city: "乌海" },
  UCB: { lng: 113.107274, lat: 41.130266, name: "乌兰察布集宁机场", city: "乌兰察布" },
  XIL: { lng: 115.963997, lat: 43.9156, name: "锡林浩特机场", city: "锡林浩特" },
  NZL: { lng: 122.768662, lat: 47.865942, name: "扎兰屯成吉思汗机场", city: "扎兰屯" },

  // 辽宁
  AOG: { lng: 122.853996, lat: 41.105301, name: "鞍山腾鳌机场", city: "鞍山" },
  CHG: { lng: 120.434998, lat: 41.538101, name: "朝阳机场", city: "朝阳" },
  DLC: { lng: 121.538611, lat: 38.965667, name: "大连周水子国际机场", city: "大连" },
  DDG: { lng: 124.28669, lat: 40.025453, name: "丹东浪头机场", city: "丹东" },
  JNZ: { lng: 121.277114, lat: 40.936032, name: "锦州湾机场", city: "锦州" },
  SHE: { lng: 123.483225, lat: 41.639751, name: "沈阳桃仙国际机场", city: "沈阳" },
  YKH: { lng: 122.3586, lat: 40.542524, name: "营口兰旗机场", city: "营口" },

  // 吉林
  DBC: { lng: 123.019722, lat: 45.505278, name: "白城长安机场", city: "白城" },
  NBS: { lng: 127.602222, lat: 42.066944, name: "长白山机场", city: "白山" },
  YSQ: { lng: 124.552121, lat: 44.931143, name: "松原查干湖机场", city: "松原" },
  TNH: { lng: 125.733963, lat: 42.048435, name: "通化三源浦机场", city: "通化" },
  YNJ: { lng: 129.451004, lat: 42.882801, name: "延吉朝阳川机场", city: "延吉" },
  CGQ: { lng: 125.684764, lat: 43.996214, name: "长春龙嘉国际机场", city: "长春" },

  // 黑龙江
  FYJ: { lng: 134.36298, lat: 48.197219, name: "抚远东极机场", city: "抚远" },
  HRB: { lng: 126.250283, lat: 45.623403, name: "哈尔滨太平国际机场", city: "哈尔滨" },
  HEK: { lng: 127.308884, lat: 50.171621, name: "黑河机场", city: "黑河" },
  JXA: { lng: 131.193, lat: 45.293, name: "鸡西兴凯湖机场", city: "鸡西" },
  JGD: { lng: 124.1175, lat: 50.371389, name: "加格达奇机场", city: "加格达奇" },
  JMU: { lng: 130.46426, lat: 46.842793, name: "佳木斯东郊机场", city: "佳木斯" },
  JSJ: { lng: 132.65792, lat: 47.108248, name: "建三江机场", city: "佳木斯" },
  OHE: { lng: 122.422759, lat: 52.916871, name: "漠河机场", city: "漠河" },
  MDG: { lng: 129.568634, lat: 44.525172, name: "牡丹江海浪机场", city: "牡丹江" },
  NDG: { lng: 123.914179, lat: 47.229969, name: "齐齐哈尔三家子机场", city: "齐齐哈尔" },
  DTU: { lng: 126.128374, lat: 48.441037, name: "五大连池德都机场", city: "五大连池" },
  LDS: { lng: 129.019125, lat: 47.752056, name: "伊春林都机场", city: "伊春" },

  // 江苏
  CZX: { lng: 119.77546, lat: 31.920485, name: "常州奔牛机场", city: "常州" },
  HIA: { lng: 119.126657, lat: 33.792712, name: "淮安涟水机场", city: "淮安" },
  LYG: { lng: 119.17899, lat: 34.41406, name: "连云港白塔埠机场", city: "连云港" },
  NKG: { lng: 118.862025, lat: 31.742042, name: "南京禄口国际机场", city: "南京" },
  NTG: { lng: 120.980076, lat: 32.073566, name: "南通兴东国际机场", city: "南通" },
  WUX: { lng: 120.42945, lat: 31.494431, name: "苏南硕放国际机场", city: "无锡" },
  XUZ: { lng: 117.555278, lat: 34.059056, name: "徐州观音机场", city: "徐州" },
  YNZ: { lng: 120.20545, lat: 33.428317, name: "盐城机场", city: "盐城" },
  YTY: { lng: 119.7198, lat: 32.5634, name: "扬州泰州机场", city: "扬州" },

  // 浙江
  HGH: { lng: 120.434453, lat: 30.229503, name: "杭州萧山国际机场", city: "杭州" },
  JNH: { lng: 120.663056, lat: 30.698056, name: "嘉兴南湖机场", city: "嘉兴" },
  NGB: { lng: 121.462151, lat: 29.826769, name: "宁波栎社国际机场", city: "宁波" },
  JUZ: { lng: 118.898793, lat: 28.96613, name: "衢州机场", city: "衢州" },
  HYN: { lng: 121.429001, lat: 28.562201, name: "台州路桥机场", city: "台州" },
  WNZ: { lng: 120.851971, lat: 27.912218, name: "温州龙湾国际机场", city: "温州" },
  YIW: { lng: 120.03116, lat: 29.342095, name: "义乌机场", city: "义乌" },
  HSN: { lng: 122.362307, lat: 29.933874, name: "舟山普陀山机场", city: "舟山" },

  // 安徽
  AQG: { lng: 117.050003, lat: 30.582199, name: "天柱山机场", city: "安庆" },
  BFY: { lng: 117.058344, lat: 33.166292, name: "蚌埠滕湖机场", city: "蚌埠" },
  FUG: { lng: 115.734364, lat: 32.882157, name: "阜阳机场", city: "阜阳" },
  HFE: { lng: 117.298267, lat: 31.780019, name: "合肥新桥国际机场", city: "合肥" },
  TXN: { lng: 118.255997, lat: 29.733299, name: "黄山屯溪机场", city: "黄山" },
  WHA: { lng: 118.66687, lat: 31.1045, name: "芜湖宣州机场", city: "芜湖" },

  // 福建
  FOC: { lng: 119.663272, lat: 25.935064, name: "福州长乐国际机场", city: "福州" },
  LCX: { lng: 116.745907, lat: 25.67592, name: "龙岩冠豸山机场", city: "龙岩" },
  JJN: { lng: 118.588599, lat: 24.795855, name: "泉州晋江机场", city: "泉州" },
  SQJ: { lng: 117.8336, lat: 26.4263, name: "三明沙县机场", city: "三明" },
  XMN: { lng: 118.127739, lat: 24.544036, name: "厦门高崎国际机场", city: "厦门" },
  WUS: { lng: 118.000999, lat: 27.7019, name: "武夷山机场", city: "武夷山" },

  // 江西
  JGS: { lng: 114.737, lat: 26.856899, name: "吉安井冈山机场", city: "吉安" },
  JDZ: { lng: 117.176003, lat: 29.3386, name: "景德镇机场", city: "景德镇" },
  KHN: { lng: 115.900017, lat: 28.864892, name: "南昌昌北国际机场", city: "南昌" },
  SQD: { lng: 117.9643, lat: 28.3797, name: "上饶三清山机场", city: "上饶" },
  YIC: { lng: 114.3062, lat: 27.8025, name: "宜春明月山机场", city: "宜春" },

  // 山东
  DOY: { lng: 118.789863, lat: 37.50137, name: "东营胜利机场", city: "东营" },
  HZA: { lng: 115.736748, lat: 35.212972, name: "菏泽牡丹机场", city: "菏泽" },
  TNA: { lng: 117.216028, lat: 36.857214, name: "济南遥墙国际机场", city: "济南" },
  JNG: { lng: 116.743269, lat: 35.647358, name: "济宁大安机场", city: "济宁" },
  LYI: { lng: 118.411828, lat: 35.052918, name: "临沂启阳国际机场", city: "临沂" },
  TAO: { lng: 120.374389, lat: 36.266108, name: "青岛胶东国际机场", city: "青岛" },
  RIZ: { lng: 119.324403, lat: 35.405033, name: "日照机场", city: "日照" },
  WEH: { lng: 122.228996, lat: 37.187099, name: "威海大水泊国际机场", city: "威海" },
  WEF: { lng: 119.119003, lat: 36.646702, name: "潍坊机场", city: "潍坊" },
  YNT: { lng: 121.37094, lat: 37.659443, name: "烟台蓬莱国际机场", city: "烟台" },

  // 河南
  LYA: { lng: 112.388, lat: 34.7411, name: "洛阳北郊机场", city: "洛阳" },
  XAI: { lng: 114.079141, lat: 32.540819, name: "信阳明港机场", city: "信阳" },
  CGO: { lng: 113.840889, lat: 34.519672, name: "郑州新郑国际机场", city: "郑州" },

  // 湖北
  EHU: { lng: 115.03926, lat: 30.341178, name: "鄂州花湖机场", city: "鄂州" },
  ENH: { lng: 109.485001, lat: 30.320299, name: "恩施许家坪机场", city: "恩施" },
  SHS: { lng: 112.44854, lat: 30.29281, name: "荆州沙市机场", city: "荆州" },
  HPG: { lng: 110.34, lat: 31.626, name: "神农架机场", city: "神农架" },
  WDS: { lng: 110.906296, lat: 32.592889, name: "十堰武当山机场", city: "十堰" },
  WUH: { lng: 114.208333, lat: 30.783758, name: "武汉天河国际机场", city: "武汉" },
  XFN: { lng: 112.291666, lat: 32.152222, name: "襄阳刘集机场", city: "襄阳" },
  YIH: { lng: 111.482563, lat: 30.554132, name: "宜昌三峡机场", city: "宜昌" },

  // 湖南
  CGD: { lng: 111.639999, lat: 28.9189, name: "常德桃花源机场", city: "常德" },
  HCZ: { lng: 112.845404, lat: 25.753419, name: "郴州北湖机场", city: "郴州" },
  HJJ: { lng: 109.704666, lat: 27.443087, name: "怀化芷江机场", city: "怀化" },
  WGN: { lng: 110.641042, lat: 26.806123, name: "邵阳武冈机场", city: "邵阳" },
  LLF: { lng: 111.610043, lat: 26.338661, name: "永州零陵机场", city: "永州" },
  YYA: { lng: 113.281574, lat: 29.311699, name: "岳阳三荷机场", city: "岳阳" },
  DYG: { lng: 110.442786, lat: 29.104749, name: "张家界荷花国际机场", city: "张家界" },
  CSX: { lng: 113.219633, lat: 28.189158, name: "长沙黄花国际机场", city: "长沙" },

  // 广东
  FUO: { lng: 113.070833, lat: 23.0825, name: "佛山沙堤机场", city: "佛山" },
  CAN: { lng: 113.298786, lat: 23.392436, name: "广州白云国际机场", city: "广州" },
  HUZ: { lng: 114.599998, lat: 23.049999, name: "惠州平潭机场", city: "惠州" },
  SWA: { lng: 116.5033, lat: 23.552, name: "汕头外砂机场", city: "汕头" },
  HSC: { lng: 113.420998, lat: 24.9786, name: "韶关丹霞机场", city: "韶关" },
  SZX: { lng: 113.810664, lat: 22.639444, name: "深圳宝安国际机场", city: "深圳" },
  ZHA: { lng: 110.590278, lat: 21.481667, name: "湛江吴川国际机场", city: "湛江" },
  ZUH: { lng: 113.375999, lat: 22.006399, name: "珠海机场", city: "珠海" },

  // 广西
  AEB: { lng: 106.959999, lat: 23.7206, name: "百色巴马机场", city: "百色" },
  BHY: { lng: 109.293683, lat: 21.538659, name: "北海福成机场", city: "北海" },
  KWL: { lng: 110.039553, lat: 25.219828, name: "桂林两江国际机场", city: "桂林" },
  HCJ: { lng: 107.710819, lat: 24.804344, name: "河池金城江机场", city: "河池" },
  LZH: { lng: 109.390999, lat: 24.2075, name: "柳州白莲机场", city: "柳州" },
  NNG: { lng: 108.172442, lat: 22.608267, name: "南宁吴圩国际机场", city: "南宁" },
  WUZ: { lng: 111.09331, lat: 23.40316, name: "梧州西江机场", city: "梧州" },
  YLX: { lng: 110.119996, lat: 22.433042, name: "玉林福绵机场", city: "玉林" },

  // 海南
  HAK: { lng: 110.458961, lat: 19.934856, name: "海口美兰国际机场", city: "海口" },
  BAR: { lng: 110.452766, lat: 19.140951, name: "琼海博鳌机场", city: "琼海" },
  SYX: { lng: 109.412272, lat: 18.302897, name: "三亚凤凰国际机场", city: "三亚" },

  // 四川
  BZX: { lng: 106.644872, lat: 31.73842, name: "巴中机场", city: "巴中" },
  CTU: { lng: 103.947086, lat: 30.578528, name: "成都双流国际机场", city: "成都" },
  TFU: { lng: 104.445304, lat: 30.308611, name: "成都天府国际机场", city: "成都" },
  DZH: { lng: 107.435646, lat: 31.048815, name: "达州金垭机场", city: "达州" },
  DCY: { lng: 100.060317, lat: 29.31632, name: "稻城亚丁机场", city: "稻城" },
  GYS: { lng: 105.694571, lat: 32.390254, name: "广元盘龙机场", city: "广元" },
  JZH: { lng: 103.682222, lat: 32.853333, name: "九寨黄龙机场", city: "九寨沟" },
  KGT: { lng: 101.73872, lat: 30.142464, name: "甘孜康定机场", city: "康定" },
  LSG: { lng: 103.749218, lat: 29.438627, name: "乐山机场", city: "乐山" },
  LZO: { lng: 105.468407, lat: 29.030357, name: "泸州云龙机场", city: "泸州" },
  MIG: { lng: 104.740997, lat: 31.428101, name: "绵阳南郊机场", city: "绵阳" },
  LZG: { lng: 106.034417, lat: 31.50191, name: "阆中古城机场", city: "南充" },
  PZI: { lng: 101.79852, lat: 26.54, name: "攀枝花保安营机场", city: "攀枝花" },
  XIC: { lng: 102.183998, lat: 27.9891, name: "西昌青山机场", city: "西昌" },
  YBP: { lng: 104.526157, lat: 28.858431, name: "宜宾五粮液机场", city: "宜宾" },

  // 贵州
  AVA: { lng: 105.873333, lat: 26.260556, name: "黄果树机场", city: "安顺" },
  BFJ: { lng: 105.472097, lat: 27.267066, name: "毕节飞雄机场", city: "毕节" },
  KWE: { lng: 106.800703, lat: 26.538522, name: "贵阳龙洞堡国际机场", city: "贵阳" },
  KJH: { lng: 107.988, lat: 26.972, name: "凯里黄平机场", city: "凯里" },
  HZH: { lng: 109.1499, lat: 26.32217, name: "黎平机场", city: "黎平" },
  LPF: { lng: 104.979, lat: 26.609417, name: "六盘水月照机场", city: "六盘水" },
  WMT: { lng: 106.435416, lat: 27.961837, name: "仁怀茅台机场", city: "仁怀" },
  TEN: { lng: 109.308889, lat: 27.883333, name: "铜仁凤凰机场", city: "铜仁" },
  ACX: { lng: 104.960804, lat: 25.083423, name: "兴义机场", city: "兴义" },
  ZYI: { lng: 107.247189, lat: 27.810723, name: "遵义新舟机场", city: "遵义" },

  // 云南
  BSD: { lng: 99.168297, lat: 25.053301, name: "保山机场", city: "保山" },
  DLU: { lng: 100.319, lat: 25.649401, name: "大理凤仪机场", city: "大理" },
  JHG: { lng: 100.762224, lat: 21.974648, name: "西双版纳嘎洒机场", city: "景洪" },
  KMG: { lng: 102.929058, lat: 25.101556, name: "昆明长水国际机场", city: "昆明" },
  JMJ: { lng: 99.784012, lat: 22.417733, name: "澜沧机场", city: "澜沧" },
  LJG: { lng: 100.244944, lat: 26.677483, name: "丽江三义机场", city: "丽江" },
  NLH: { lng: 100.7593, lat: 27.5403, name: "宁蒗泸沽湖机场", city: "丽江" },
  CWJ: { lng: 99.373169, lat: 23.276331, name: "沧源佤山机场", city: "临沧" },
  LNJ: { lng: 100.025002, lat: 23.7381, name: "临沧机场", city: "临沧" },
  LUM: { lng: 98.5317, lat: 24.4011, name: "德宏芒市机场", city: "芒" },
  TCZ: { lng: 98.485833, lat: 24.938056, name: "腾冲驼峰机场", city: "腾冲" },
  DIG: { lng: 99.6772, lat: 27.7936, name: "迪庆香格里拉机场", city: "香格里拉" },
  ZAT: { lng: 103.691511, lat: 27.205843, name: "昭通机场", city: "昭通" },

  // 西藏
  NGQ: { lng: 80.053971, lat: 32.09794, name: "阿里昆莎机场", city: "阿里" },
  BPX: { lng: 97.108299, lat: 30.5536, name: "昌都邦达机场", city: "昌都" },
  LXA: { lng: 90.911944, lat: 29.297778, name: "拉萨贡嘎国际机场", city: "拉萨" },
  LZY: { lng: 94.335297, lat: 29.303301, name: "林芝米林机场", city: "林芝" },
  DDR: { lng: 86.798, lat: 28.604567, name: "日喀则定日机场", city: "日喀则" },
  RKZ: { lng: 89.299157, lat: 29.350876, name: "日喀则和平机场", city: "日喀则" },

  // 陕西
  HZG: { lng: 107.203817, lat: 33.133527, name: "汉中城固机场", city: "汉中" },
  XIY: { lng: 108.751592, lat: 34.447119, name: "西安咸阳国际机场", city: "西安" },
  ENY: { lng: 109.464083, lat: 36.479413, name: "延安南泥湾机场", city: "延安" },
  UYN: { lng: 109.590927, lat: 38.35971, name: "榆林西沙机场", city: "榆林" },

  // 甘肃
  GXH: { lng: 102.622261, lat: 34.819014, name: "甘南夏河机场", city: "甘南" },
  JGN: { lng: 98.339344, lat: 39.859052, name: "嘉峪关机场", city: "嘉峪关" },
  JIC: { lng: 102.348333, lat: 38.542222, name: "金昌金川机场", city: "金昌" },
  DNH: { lng: 94.812827, lat: 40.161953, name: "敦煌机场", city: "酒泉" },
  LHW: { lng: 103.620639, lat: 36.515242, name: "兰州中川国际机场", city: "兰州" },
  LNL: { lng: 105.790014, lat: 33.789918, name: "陇南成州机场", city: "陇南" },
  IQN: { lng: 107.598896, lat: 35.802638, name: "庆阳机场", city: "庆阳" },
  THQ: { lng: 105.860343, lat: 34.5601, name: "天水麦积山机场", city: "天水" },
  YZY: { lng: 100.675003, lat: 38.801899, name: "张掖甘州机场", city: "张掖" },

  // 青海
  HXD: { lng: 97.268658, lat: 37.125286, name: "德令哈机场", city: "德令哈" },
  GOQ: { lng: 94.786102, lat: 36.4006, name: "格尔木机场", city: "格尔木" },
  GMQ: { lng: 100.301144, lat: 34.418066, name: "果洛玛沁机场", city: "果洛" },
  HTT: { lng: 90.837843, lat: 38.201645, name: "海西茫崖机场", city: "茫崖" },
  XNN: { lng: 102.043336, lat: 36.527539, name: "西宁曹家堡国际机场", city: "西宁" },
  YUS: { lng: 97.036389, lat: 32.836389, name: "玉树巴塘机场", city: "玉树" },

  // 宁夏
  GYU: { lng: 106.216944, lat: 36.078889, name: "固原六盘山机场", city: "固原" },
  INC: { lng: 106.389183, lat: 38.481944, name: "银川河东国际机场", city: "银川" },
  ZHY: { lng: 105.154454, lat: 37.573125, name: "中卫沙坡头机场", city: "中卫" },

  // 新疆
  AKU: { lng: 80.291702, lat: 41.262501, name: "阿克苏红旗坡机场", city: "阿克苏" },
  AAT: { lng: 88.085808, lat: 47.749886, name: "阿勒泰机场", city: "阿勒泰" },
  BPL: { lng: 82.30007, lat: 44.895461, name: "阿拉山口机场", city: "博乐" },
  KJI: { lng: 86.9959, lat: 48.2223, name: "布尔津喀纳斯机场", city: "布尔津" },
  FYN: { lng: 89.512006, lat: 46.804169, name: "富蕴机场", city: "富蕴" },
  HMI: { lng: 93.669197, lat: 42.8414, name: "哈密机场", city: "哈密" },
  HTN: { lng: 79.864899, lat: 37.038502, name: "和田机场", city: "和田" },
  KHG: { lng: 76.02023, lat: 39.542273, name: "喀什徕宁国际机场", city: "喀什" },
  KRL: { lng: 86.140817, lat: 41.614979, name: "库尔勒机场", city: "库尔勒" },
  IQM: { lng: 85.465462, lat: 38.234516, name: "且末机场", city: "且末" },
  RQA: { lng: 88.008333, lat: 38.974722, name: "若羌楼兰机场", city: "若羌" },
  QSZ: { lng: 77.056149, lat: 38.24542, name: "莎车机场", city: "莎车" },
  HQL: { lng: 75.288877, lat: 37.661333, name: "塔什库尔干红其拉甫机场", city: "塔什库尔干" },
  TLQ: { lng: 89.0987, lat: 43.0308, name: "吐鲁番交河机场", city: "吐鲁番" },
  URC: { lng: 87.474244, lat: 43.907106, name: "乌鲁木齐天山国际机场", city: "乌鲁木齐" },
  NLT: { lng: 83.3786, lat: 43.4318, name: "新源那拉提机场", city: "新源" },
  YIN: { lng: 81.330299, lat: 43.955799, name: "伊犁伊宁国际机场", city: "伊宁" },
};

/**
 * 根据 IATA 机场代码获取机场信息
 * @param iataCode 三字码（如 "PEK"）
 * @returns 机场信息（坐标/名称/城市）或 null（不在映射表中）
 */
export function getAirportInfo(iataCode: string): AirportInfo | null {
  return AIRPORT_COORDS[iataCode.toUpperCase()] || null;
}

export interface AirportEntry extends AirportInfo {
  code: string;
}

/** 全部机场，按城市（拼音）再按三字码排序；下拉的直接数据源 */
export const AIRPORT_LIST: AirportEntry[] = Object.entries(AIRPORT_COORDS)
  .map(([code, info]) => ({ code, ...info }))
  .sort(
    (a, b) => a.city.localeCompare(b.city, "zh") || a.code.localeCompare(b.code)
  );

/** 去重后的城市列表（跟着 AIRPORT_LIST 一起是有序的） */
export const AIRPORT_CITIES: string[] = [
  ...new Set(AIRPORT_LIST.map((a) => a.city)),
];

/**
 * 反查：机场全称 → 条目。用于给老数据补三字码 ——
 * 老航班行没有 from_code，但 from_city 里存的就是机场全称，能对上。
 */
const BY_NAME = new Map(AIRPORT_LIST.map((a) => [a.name, a]));

export function getAirportByName(name: string): AirportEntry | null {
  return BY_NAME.get(name.trim()) ?? null;
}
