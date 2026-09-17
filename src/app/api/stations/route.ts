import { NextResponse } from "next/server";
import type { StationOption } from "@/types/train";

/**
 * GET /api/stations?keywords=宜昌北&city=宜昌
 *
 * 站名 → 坐标 + 城市。用「Web服务」类型的 key 打高德 REST（跟 /api/place-detail
 * 同一个 key，**故意不加 NEXT_PUBLIC_ 前缀**，加了会被打包进客户端 bundle）。
 *
 * 为什么不能用 /api/place（DestinationSearchInput 那条路）：那个输入框把结果按
 * getAdminLevel 过滤成只剩行政地名（省/地市/国家），火车站是
 * 「交通设施服务;火车站;火车站」，会被整个筛掉。所以这里单开一条，只查
 * types=150200（火车站），不做任何行政级别过滤 —— 但**要做粒度过滤**，
 * 见 isTrainStation（那个 types 只筛类目，进站口/地铁站照样回得来）。
 *
 * 这个 key 是**可选**的：没配就直接回 `{ stations: [] }`（200，不是 500），而且是
 * **在发请求之前**就返回 —— "没申请 Web 服务 key" 是正常状态，前端据此退化成纯手打
 * 站名（没有城市、没有坐标，站点卡照样能挂，只是地图上没位置）。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keywords = (searchParams.get("keywords") ?? "").trim();
  const city = (searchParams.get("city") ?? "").trim();
  const key = process.env.AMAP_WEB_KEY;

  if (!keywords) {
    return NextResponse.json(
      { error: "Missing keywords parameter" },
      { status: 400 }
    );
  }

  if (!key) {
    // 没配 key 是降级，不是错误
    return NextResponse.json({ stations: [] });
  }

  try {
    const params = new URLSearchParams({
      key,
      keywords,
      types: "150200", // 交通设施服务;火车站
      extensions: "base",
    });
    // 带上城市能显著提高命中率（"北站"这种词不带城市会满世界乱回），但它不是必填
    if (city) params.set("city", city);

    const response = await fetch(
      `https://restapi.amap.com/v3/place/text?${params.toString()}`,
      { headers: { Accept: "application/json" }, cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`AMap API error: ${response.status}`);
    }

    // 高德出错时也回 HTTP 200，成功与否得看 body 里的 status（"1" = 成功），
    // 所以必须先判 response.ok 再判这个 —— 反过来会把 500 也当成正常响应
    const data = await response.json();
    if (data.status !== "1") {
      console.error("AMap place/text error:", data.info, data.infocode);
      return NextResponse.json({ stations: [] });
    }

    const pois: Array<Record<string, unknown>> = Array.isArray(data.pois)
      ? data.pois
      : [];

    const stations = pois
      // types=150200 只筛到"类目"，筛不掉 POI 的粒度，这里自己再过一遍（见 isTrainStation）
      .filter(isTrainStation)
      .map((poi) => toStation(poi))
      .filter((s): s is StationOption => s !== null);

    // 高德自己也会顺着模糊匹配排，但它更看重热度：打"宜昌北"时冒出来的第一条
    // 未必是"宜昌北站"。把名字跟查询词互相包含的往前排，剩下的按原序跟在后面。
    const exact = stations.filter(
      (s) => s.name.includes(keywords) || keywords.includes(s.name)
    );
    const rest = stations.filter((s) => !exact.includes(s));

    return NextResponse.json({ stations: [...exact, ...rest].slice(0, 8) });
  } catch (error) {
    console.error("AMap station search error:", error);
    return NextResponse.json(
      { error: "Failed to search stations" },
      { status: 500 }
    );
  }
}

/**
 * 附属设施的名字里常带的词。搜"成都"时上游会回「成都东站A进站口」「成都北站地铁站」
 * 「XX站地下停车场」—— 用户要的是"在哪个站上下车"，这些都不是站，存进 trains 表和
 * 站点卡就是垃圾数据。
 *
 * 挑词的标准是**宁可窄**：只放"只可能是设施、不可能出现在站名里"的词。「机场」不在里面 ——
 * 「北京大兴机场站」「白云机场北站」是真站；「广场」在里面 —— 站名带广场的至今没见过，
 * 而「人民广场站」这类地铁站正好该被它挡掉。
 *
 * ⚠️ **这份表是补漏的，不是主力**：设施的构词法枚举不完（检票口、商务通道、母婴室、
 * 便利店、取票处…），主力是下面那个按结构切的 hasFacilitySuffix。
 */
const JUNK_NAME_TOKENS = [
  "进站口",
  "出站口",
  "出入口",
  "入口",
  "出口",
  "检票",
  "通道",
  "地铁",
  "停车场",
  "停车楼",
  "售票",
  "取票",
  "候车",
  "安检",
  "电梯",
  "扶梯",
  "天桥",
  "地下",
  "广场",
  "公交",
  "出租",
  "汽车",
  "厕所",
  "卫生间",
  "服务台",
  "寄存",
];

/**
 * 名字是「主站名（设施名）」这种附属设施 → true。
 *
 * 为什么要按结构切而不是继续加词：附属设施在高德眼里是**类目内的独立 POI**（中类仍是
 * 「火车站」，有自己 id 和坐标），而它们的名字只有两种构词法 ——
 *   1. 主站名直接缀设施名：「成都东站A进站口」→ 靠上面的词表拦；
 *   2. 主站名 + 括号里的设施名：「成都南站(检票口4)」「成都东站(商务通道)」→ 就是这里。
 * 第 2 种是**枚举不完的**：今天堵了两个，明天冒出「(母婴室)」「(取票处)」。但结构一样 ——
 * **括号里写的是设施，不是站名**。
 *
 * 唯一放行的例外：括号里**带「站」字**的，那是别名写法（「成都站(成都北站)」这种
 * 主名与俗称并列），是真站，有用，留着。
 *
 * 代价说明：如果哪天某个真站的 POI 被高德写成了「XX站(XX)」而括号里没有「站」字，
 * 它会被误杀 —— 表现成"这个站查不到"。真遇到了把它发我，加白名单比放宽这条划算。
 */
function hasFacilitySuffix(name: string): boolean {
  const match = name.match(/[（(]([^）)]*)[）)]/);
  return match ? !match[1].includes("站") : false;
}

/**
 * 这条 POI 是不是一个**能上下车的火车站**。三道闸，各拦各的一类：
 *
 *  1. **名字里的设施词**（JUNK_NAME_TOKENS）：主站名直接缀设施名的那种，「成都东站A进站口」；
 *  2. **名字的括号结构**（hasFacilitySuffix）：主站名 + 括号设施名的那种，「成都南站(检票口4)」。
 *     这一条是主力，因为它不依赖"猜得到设施叫什么"；
 *  3. **中类必须是「火车站」**：整片切掉别的类目。
 *
 * 为什么 3 是最弱的一道、却还留着：`types=150200` 只指定了"交通设施服务;火车站"这个**类目**，
 * 而高德的类目是分层的（大类;中类;小类），类目匹配放行整棵子树。实测搜"成都"回的那些
 * 进站口/检票口/商务通道，中类**仍然是「火车站」**（它们是类目内的独立 POI，有自己 id 和
 * 坐标），所以 1、2 才是真正干活的两道 —— 3 挡的是"地铁站""停车场"这类中类确实不同的。
 *
 * 中类拿不到时**不拿它当判据**（宁可放过、不可错杀）：type 是扩展字段，缺了是上游的事，
 * 这时还有 1、2 兜着。真漏网了也只是候选人里多一条，用户看得见、选得中；
 * 而错杀一个真站，用户会以为"这个站高德查不到"。
 *
 * 顺带一提：过滤放在路由里而不是组件里。这是上游数据的唯一进出口，跟
 * DestinationSearchInput 那条路把结果滤成行政地名的做法是同一个位置；放客户端就得
 * 每个用到联想的地方各写一遍，迟早分叉。
 */
function isTrainStation(poi: Record<string, unknown>): boolean {
  const name = typeof poi.name === "string" ? poi.name : "";
  if (JUNK_NAME_TOKENS.some((token) => name.includes(token))) return false;
  // 结构闸（主力）：主站名后面的括号里写的不是站名，就是附属设施
  if (hasFacilitySuffix(name)) return false;

  const type = typeof poi.type === "string" ? poi.type : "";
  // 高德的 type 是 "大类;中类;小类"（例："交通设施服务;火车站;火车站"）
  const category = type.split(";")[1]?.trim();
  if (category && category !== "火车站") return false;

  return true;
}

/** 高德的一条 POI → StationOption；缺名字或缺 id 的直接丢掉（前端拿它做 React key 和 groupKey） */
function toStation(poi: Record<string, unknown>): StationOption | null {
  const name = typeof poi.name === "string" ? poi.name : "";
  if (!name) return null;

  return {
    // 理论上 poi.id 一直在，但真缺了也得能用：退化成用站名当 key，
    // 站名天然唯一（不像机场，一个城市好几个），足够当身份用
    id: typeof poi.id === "string" && poi.id ? poi.id : name,
    name,
    city: normalizeCity(poi.cityname),
    ...parseLocation(poi.location),
  };
}

/**
 * 高德的 cityname 带行政区后缀（"武汉市"、"湖北省"），而本项目的城市名一律是裸名
 * （trips.destination_name = "西宁"、"巴黎"）。只去掉末尾那个「市」—— 这是最窄的一条
 * 规则，直辖市的"北京市"→"北京"正好对；"湖北省"这种带省的（省直辖县级市会出现）
 * 留着原样，总比乱砍一刀好。
 */
function normalizeCity(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.replace(/市$/, "");
}

/** 高德的 location 是 "lng,lat" 字符串（不是数组），解析不出来就两个 null */
function parseLocation(value: unknown): { lng: number | null; lat: number | null } {
  if (typeof value !== "string") return { lng: null, lat: null };
  const [lngRaw, latRaw] = value.split(",");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  return {
    lng: Number.isFinite(lng) ? lng : null,
    lat: Number.isFinite(lat) ? lat : null,
  };
}
