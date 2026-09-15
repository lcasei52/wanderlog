import { NextResponse } from "next/server";

/**
 * GET /api/place-detail?id=<poiId>
 * 用「Web服务」类型的 key 打高德 REST，取 JSAPI 拿不到的那几个字段
 * （评分 / 人均 / 营业时间，都在 biz_ext 里）。
 *
 * 这个 key 是**可选**的：没配就直接回 `{ facts: null }`（200，不是 500）——
 * "没申请 Web 服务 key" 是正常状态，不该在控制台报错，前端据此不渲染那几行。
 *
 * 注意：这里的 key 必须是「Web服务」类型，跟 JSAPI 的 NEXT_PUBLIC_AMAP_KEY 不是一回事，
 * 拿后者来打会回 INVALID_USER_KEY。所以变量名是 AMAP_WEB_KEY，**故意不加
 * NEXT_PUBLIC_ 前缀** —— 加了会被打包进客户端 bundle，等于把 key 公开给每个访客。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get("id") ?? "").trim();
  const key = process.env.AMAP_WEB_KEY;

  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  if (!key) {
    // 没配 key 是降级，不是错误
    return NextResponse.json({ facts: null });
  }

  try {
    const response = await fetch(
      `https://restapi.amap.com/v3/place/detail?key=${key}&id=${encodeURIComponent(id)}&extensions=all`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) {
      throw new Error(`AMap API error: ${response.status}`);
    }

    const data = await response.json();
    // 高德出错时也回 HTTP 200，成功与否得看 body 里的 status（"1" = 成功）
    if (data.status !== "1") {
      return NextResponse.json({ facts: null });
    }

    // biz_ext 里没有的字段高德会回空数组 []（不是 null），交给前端那个 str() 判空
    const biz = data.pois?.[0]?.biz_ext ?? {};
    // 营业时间这个字段历史上两种拼法都出现过，都读
    return NextResponse.json({
      facts: {
        rating: biz.rating ?? null,
        cost: biz.cost ?? null,
        openTime: biz.open_time ?? biz.opentime ?? null,
      },
    });
  } catch (error) {
    console.error("AMap place detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch place detail" },
      { status: 500 }
    );
  }
}
