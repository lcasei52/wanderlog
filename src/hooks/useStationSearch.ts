"use client";

import { useEffect, useRef, useState } from "react";
import { useDebounce } from "./useDebounce";
import { searchStations } from "@/lib/stations";
import type { StationOption } from "@/types/train";

/** 打字的停顿阈值。高德那条路一次请求一个配额，别每敲一下就发 */
const DEBOUNCE_MS = 350;

/**
 * 火车站名联想。
 *
 * 为什么要做成 hook 而不是像 DestinationSearchInput 那样把 effect 内联进组件：
 * 一个火车表单里要同时开**两个**实例（出发站、到达站），内联就得写两遍。
 *
 * 两条护栏，缺一不可：
 *  - **防抖**：只在停手 350ms 后发一次请求；
 *  - **丢弃过期响应**：请求是并发的，`宜昌` 的回包可能晚于 `宜昌北` 到达，
 *    没有护栏的话输入框里是「宜昌北」、下拉里却是「宜昌」的结果。
 *    seq 是自增的，回来时对不上就当它不存在。
 *
 * `unavailable` 只表示"联想这条路走不通"（网络挂了 / 高德没配 key 时自家路由
 * 回 500 以外的情况由 route 那边兜成空数组，这里判断不出来）。界面据此提示
 * "可以直接手打站名"，而不是把空下拉当成"没有这个站"。
 */
export function useStationSearch(query: string, city?: string | null) {
  const [options, setOptions] = useState<StationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const debouncedQuery = useDebounce(query.trim(), DEBOUNCE_MS);
  const seqRef = useRef(0);

  useEffect(() => {
    // 输入框清空：作废在途请求（++seq），否则它回来会把上次的结果又填回下拉
    if (debouncedQuery === "") {
      seqRef.current += 1;
      setOptions([]);
      setLoading(false);
      return;
    }

    const seq = ++seqRef.current;
    setLoading(true);

    void (async () => {
      try {
        const next = await searchStations(debouncedQuery, city);
        if (seq !== seqRef.current) return;
        setOptions(next);
        setUnavailable(false);
      } catch (err) {
        if (seq !== seqRef.current) return;
        console.error("站点联想失败:", err);
        setOptions([]);
        setUnavailable(true);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  }, [debouncedQuery, city]);

  return { options, loading, unavailable };
}
