/**
 * 偶发连接失败的重试。
 *
 * 本机到 Neon 这条链路会整趟连接超时（见 db/client.ts 的三条推论），症状是首屏
 * 某一个读挂掉 → **整个页面掉进错误界面**，手动刷新一次就好。这个 helper 就是把
 * "手动刷新一次"自动做掉。
 *
 * **只用于读，不要拿去包写。** 读幂等，重试永远安全；写不是 —— 请求已经发出去、
 * 响应却丢了的情况下重试会插出重复行，而"失败在发出前还是发出后"在这一层分辨
 * 不出来。所以这里没有做成 client.ts 里的全局 fetch 重试（那是能做到一处覆盖
 * 全部查询的，代价是把 INSERT 也一起重试了）。
 */

/** 重试次数（含首次）。实测第 2 次通常就成，第 3 次是留给"三个 IP 一起超时"的余地 */
const ATTEMPTS = 3;

/** 两次之间的间隔。失败是连接没建起来，隔一下重来比立刻重来有效 */
const DELAY_MS = 400;

/**
 * "连不上"这类传输层失败的签名 —— 用来把它和"SQL 本身有问题"区分开。
 *
 * 认签名而不是认错误类型：驱动把连接阶段的失败统一抛成 NeonDbError，消息固定是
 * `Error connecting to database: ${原始错误}`，原始错误挂在 sourceError 上；
 * drizzle 又在外面套了一层 DrizzleQueryError（消息是 `Failed query: …`，
 * 原始错误在 cause 上，见 node_modules/drizzle-orm/errors.js）。
 * 原始错误的文字被模板串进了消息里，所以匹配消息就够，不必去认 undici 的类型。
 */
const CONNECT_FAILURE =
  /Error connecting to database|ConnectTimeout|fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up/i;

/** 沿着 cause 链找连接失败的签名（正常情况下只有两层：drizzle → 驱动） */
export function isConnectFailure(error: unknown): boolean {
  let current: unknown = error;
  // 深度兜底，防 cause 成环
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (CONNECT_FAILURE.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

/**
 * 跑一个读。碰上连接失败重试；其它错误（SQL 写错、列不存在……）立刻抛出去 ——
 * 那种错误重试只是白等，而且会把真问题盖住。
 */
export async function withRetry<T>(
  run: () => Promise<T>,
  attempts: number = ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isConnectFailure(error)) throw error;
      console.warn(
        `Neon 连接失败，第 ${attempt} 次重试：`,
        error instanceof Error ? error.cause ?? error.message : error,
      );
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }
}
