import { NextResponse } from "next/server";
import { getAirportInfo } from "@/lib/airport-coordinates";
import type { FlightApiResult, FlightLegApi } from "@/types/flight";

/**
 * GET /api/flights?flight_iata=CA1234
 * 代理 AviationStack（隐藏 API key），返回一份"可入库"的简化航班信息。
 *
 * 说明：
 * - 只支持国内航班：出发/到达机场若命中国内映射表，就翻译成中文城市+机场名并带上坐标；
 *   命不中（国际/小众机场）则保留源数据英文名，city/lng/lat 置空，由前端优雅降级。
 * - 源数据的 scheduled 是 UTC ISO（+00:00），不在这里换算，交给客户端统一 +8 转北京时间。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const flightIata = (searchParams.get("flight_iata") ?? "")
    .trim()
    .toUpperCase();
  const apiKey = process.env.AVIATIONSTACK_API_KEY;

  if (!flightIata) {
    return NextResponse.json(
      { error: "Missing flight_iata parameter" },
      { status: 400 }
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "AviationStack API key not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(flightIata)}&limit=1`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) {
      throw new Error(`AviationStack API error: ${response.status}`);
    }

    const data = await response.json();
    const raw = data.data?.[0];

    if (!raw?.flight?.iata) {
      return NextResponse.json({ error: "Flight not found" }, { status: 404 });
    }

    // 把一段航程(出发/到达)翻译成前端友好的结构
    const pickLeg = (leg: {
      iata?: string;
      airport?: string;
      scheduled?: string;
      estimated?: string;
    }): FlightLegApi => {
      const code = leg.iata ?? "";
      const info = code ? getAirportInfo(code) : null;
      return {
        code,
        city: info?.city ?? null,
        airport: info?.name ?? leg.airport ?? code,
        lng: info?.lng ?? null,
        lat: info?.lat ?? null,
        time: leg.scheduled || leg.estimated || null,
      };
    };

    const departure = pickLeg(raw.departure ?? {});
    const arrival = pickLeg(raw.arrival ?? {});

    if (!departure.code || !arrival.code) {
      return NextResponse.json(
        { error: "航班数据不完整（缺少起降机场）" },
        { status: 404 }
      );
    }

    const result: FlightApiResult = {
      flightNumber: raw.flight.iata,
      airline: raw.airline?.name ?? "",
      departure,
      arrival,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("AviationStack API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch flight information" },
      { status: 500 }
    );
  }
}
