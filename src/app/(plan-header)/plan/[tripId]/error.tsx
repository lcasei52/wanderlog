"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 行程页的错误边界。
 *
 * 之前这里什么都没有，于是任何一次首屏查询失败都直接落到 Next 内置的那个红字
 * 错误页 —— 用户看到的是一坨 SQL 和堆栈。最常见的原因根本不是代码有问题，而是
 * 本机到 Neon 那一趟连接超时（见 db/client.ts）：手动刷新一下就好。
 *
 * 现在 page.tsx 里的读都套了 withRetry，正常情况下到不了这儿；这一层是兜底 ——
 * 万一三次重试都没连上，给一个「重试」按钮（就是 router.refresh 的语义，
 * 重新跑一遍这个段的服务端渲染），而不是让人自己想起来去按 F5。
 */
export default function TripError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("行程页渲染失败:", error);
  }, [error]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 text-orange-500" />
          <h2 className="text-lg font-semibold text-gray-900">行程没能打开</h2>
        </div>

        <p className="mt-3 text-sm text-gray-600">
          多半是数据库连接不稳定，重试一下通常就好了。你的数据没有丢。
        </p>

        <div className="mt-6 flex gap-2">
          <Button
            type="button"
            className="bg-orange-500 hover:bg-orange-600"
            onClick={reset}
          >
            重试
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            刷新页面
          </Button>
        </div>

        {/* 具体报错折叠起来：排查时要看，但平时不该占着屏幕 */}
        <details className="mt-6">
          <summary className="cursor-pointer text-xs text-gray-400">
            技术细节
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-50 p-3 text-xs whitespace-pre-wrap break-all text-gray-500">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        </details>
      </div>
    </div>
  );
}
