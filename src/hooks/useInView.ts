"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 元素是否"进入过"视口（滚进可见区域一次就置 true 并保持，不再回退）。
 *
 * 用来做懒加载：间隔滚到眼前才去查路线，避免一打开行程就把
 * 所有间隔 × 三种模式的请求全打出去（路径规划是算配额的）。
 * rootMargin 提前一点触发，滚到跟前时结果已经在了，不会先闪一下"计算中"。
 */
export function useInView<T extends HTMLElement>(rootMargin = "240px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    // 老浏览器 / 测试环境没有 IntersectionObserver：当作一直在视野里
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
