import { NextResponse } from "next/server";
import type { TrainSearchItem, TrainStop } from "@/types/train";

/*
 * GET /api/trains?mode=search&keyword=G1030&date=2026-09-20
 * GET /api/trains?mode=stops&train_no=7b000G103002&date=2026-09-20
 *
 * 代理 12306 的两个**免鉴权**接口。两条分支放同一个文件，是因为它们共用同一套
 * fetch/归一化/错误映射和同一套克制的姿态，而这个上游随时会坏 —— 要修要删都只有
 * 一个地方。
 *
 * ⚠️ 这两个接口是非官方的：没有文档、没有 SLA，路径历史上轮换过（leftTicket 那套就
 * 换过好几次，而且已经改成必须带会话 cookie）。所以整条链路的规矩是：
 *   - **只在用户明确点「查询」时打一次上游**，不重试、不在用户打字时发请求、不做
 *     后台轮询（唯一的例外是客户端在跨夜车查不到时拿前一天再试一次，那也是一次
 *     明确点击上的一次额外请求，不是循环）；
 *   - **手填必须是完整可用的主路径** —— 把这个文件整个删掉，火车功能照样能用，
 *     只是没有自动填。这是这套设计的验收标准。
 * 2026-04 中央网信办和国家铁路局约谈过 7 家第三方票务平台，明令不得用自动化程序
 * 高频干扰 12306 的安全核验。上面那几条不只是为了不被封。
 *
 * 另外注意：这里**没有**「缺 key → 500」那一支，12306 不要任何凭证 —— 对比紧挨着的
 * /api/flights（那个要 AVIATIONSTACK_API_KEY，少了就 500）。
 *
 * 死路，别顺手去接：leftTicket/query（按线路列当天车次 + 余票票价）会 302 到
 * queryG，直接打 queryG 也是 302、0 字节 —— 那条路要会话 cookie，是反爬重点。
 */

/** 12306 的 "HH:mm"；始发站/终到站的占位是字面量 "----"，别的异常值一并归 null */
function normalizeHhmm(value: unknown): string | null {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : null;
}

/**
 * 上游要超时兜底：12306 可能直接把连接黑洞掉。这是用户点出来的请求，挂在那儿不返回
 * 比干脆回 500 更糟（浏览器那头一直转圈，用户只会反复点）。
 */
const UPSTREAM_TIMEOUT_MS = 8000;

const UPSTREAM_HEADERS = {
  // 不带 UA 时 12306 会回一个空 body 或者直接拒绝
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.12306.cn/",
  Accept: "application/json, text/javascript, */*; q=0.01",
};

/**
 * 老 Struts 端点，出错时可能回 HTML 而不是 JSON，所以走 text() + 手动 parse，
 * 别直接 .json()（那样抛出来的是 SyntaxError，跟"上游挂了"混在一起分不清）。
 * 解析不出来一律当"上游异常"往上抛，由调用方统一映射成 500。
 */
async function fetchUpstreamJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: UPSTREAM_HEADERS,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`12306 API error: ${response.status}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("12306 API returned a non-JSON body");
  }
}

/** keyword 是前缀匹配，一次会回好几条（"G10" → G10、G100…），所以返回的是列表 */
async function searchTrains(
  keyword: string,
  date: string
): Promise<NextResponse> {
  // 上游要的是紧凑格式 20260920。**绝不** new Date(date).toISOString() —— 那会按 UTC
  // 解析再转回来，UTC 以东的凌晨会整体错一天。字符串直接去掉横杠最稳。
  const compact = date.replaceAll("-", "");
  const json = (await fetchUpstreamJson(
    `https://search.12306.cn/search/v1/train/search?keyword=${encodeURIComponent(
      keyword
    )}&date=${compact}`
  )) as {
    status?: boolean;
    data?: Array<{
      station_train_code?: string;
      train_no?: string;
      from_station?: string;
      to_station?: string;
    }>;
  };

  if (json.status !== true) {
    throw new Error("12306 search API returned status != true");
  }

  const rows = Array.isArray(json.data) ? json.data : [];
  // 空数组有两种成因：车次号根本不存在，或者这天超出了 15 天预售期（12306 只放
  // 当前起 15 天内的票）。对上游来说长得一样，交给客户端在文案里一起说。
  if (rows.length === 0) {
    return NextResponse.json({ error: "Train not found" }, { status: 404 });
  }

  const trains: TrainSearchItem[] = rows
    .filter((r) => r.station_train_code && r.train_no)
    .map((r) => ({
      trainNumber: r.station_train_code as string,
      trainNo: r.train_no as string,
      fromStation: r.from_station ?? "",
      toStation: r.to_station ?? "",
    }));

  if (trains.length === 0) {
    return NextResponse.json({ error: "Train not found" }, { status: 404 });
  }
  return NextResponse.json({ trains });
}

async function fetchStops(trainNo: string, date: string): Promise<NextResponse> {
  const json = (await fetchUpstreamJson(
    `https://kyfw.12306.cn/otn/czxx/queryByTrainNo?train_no=${encodeURIComponent(
      trainNo
    )}&from_station_telecode=&to_station_telecode=&depart_date=${encodeURIComponent(
      date
    )}`
  )) as {
    status?: boolean;
    // 信封是 data.data —— 外层 data 是个对象不是数组，判空要往里再挖一层
    data?: { data?: unknown } | unknown[];
  };

  if (json.status !== true) {
    throw new Error("12306 queryByTrainNo API returned status != true");
  }

  const raw = Array.isArray(json.data) ? json.data : json.data?.data;
  const rows = Array.isArray(raw) ? raw : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "Train not found" }, { status: 404 });
  }

  const sorted = (rows as Array<Record<string, unknown>>)
    .map((r) => ({
      stationName: String(r.station_name ?? ""),
      stationNo: Number(r.station_no) || 0,
      arriveTime: normalizeHhmm(r.arrive_time),
      startTime: normalizeHhmm(r.start_time),
    }))
    .filter((s) => s.stationName !== "")
    .sort((a, b) => a.stationNo - b.stationNo);

  /*
   * 跨夜偏移：12306 只给 "HH:mm" 不给日期，得按站序自己推。
   * 一条线上时刻是递增的，**变小了就说明跨过了 0 点**。
   * "HH:mm" 是定宽零填充的，字符串比大小就等于比时刻，不用转数字。
   * 取 arrive_time ?? start_time：始发站只有 start_time。
   */
  const stops: TrainStop[] = [];
  let offset = 0;
  let prev: string | null = null;
  for (const s of sorted) {
    const t = s.arriveTime ?? s.startTime;
    if (prev && t && t < prev) offset++;
    stops.push({ ...s, dayOffset: offset });
    if (t) prev = t;
  }

  const response = NextResponse.json({ stops });
  // 同一车次当天的经停表不会变，让 CDN/浏览器存一会儿，白省一趟对 12306 的请求。
  // search 那条**不**缓存：它带日期，而且本来就不该多做。
  response.headers.set("Cache-Control", "public, max-age=1800");
  return response;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = (searchParams.get("mode") ?? "").trim();
  const date = (searchParams.get("date") ?? "").trim();

  if (mode !== "search" && mode !== "stops") {
    return NextResponse.json(
      { error: "Missing or invalid mode parameter (search | stops)" },
      { status: 400 }
    );
  }
  // 只做格式校验，不做"是不是合法日期"的语义校验 —— 上游自己会拒
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Missing or invalid date parameter (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  try {
    if (mode === "search") {
      const keyword = (searchParams.get("keyword") ?? "").trim().toUpperCase();
      if (!keyword) {
        return NextResponse.json(
          { error: "Missing keyword parameter" },
          { status: 400 }
        );
      }
      return await searchTrains(keyword, date);
    }

    const trainNo = (searchParams.get("train_no") ?? "").trim();
    if (!trainNo) {
      return NextResponse.json(
        { error: "Missing train_no parameter" },
        { status: 400 }
      );
    }
    return await fetchStops(trainNo, date);
  } catch (error) {
    console.error("12306 API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch train information" },
      { status: 500 }
    );
  }
}
