"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  DEFAULT_ROUTE_MODE,
  type CachedRoutePlan,
  type RouteMode,
  type RoutePlan,
  type RoutePoint,
} from "@/lib/place-route";
import { requestRoutePlan } from "@/hooks/useAMapRoute";
import { saveRoutePlan } from "@/actions/routes";

/**
 * 路线的共享状态：间隔上的那一行（行程列）与地图上的那些线（地图列）是两个兄弟组件，
 * 所以查询缓存、图层级总开关、隐藏状态都放这里。
 *
 * 分工（重要，不然很容易接错线）：
 * - "这段路用哪种交通方式" **不在这里** —— 它存在起点卡上（place_items.route_mode_to_next，
 *   见 lib/place-route 的 routeModeOf），因为拖排序/换天之后这段路要跟着起点卡走。
 * - 这里管的是"查过没有、查出来是什么"（plans）与"画不画"（showRoutes / hiddenGaps）。
 *
 * 缓存分两层，键都是 routeKey（坐标+模式，见 lib/place-route）：
 * - 内存：本次会话的查询结果，挡住重复请求；
 * - route_plans 表：跨会话/刷新的缓存。首屏由服务端读好（db/route-plans.ts）灌进来，
 *   每次查出新结果再回写（actions/routes.ts）。
 *   有了它，"重开行程"基本不会再花高德的路径规划配额（配额有限，见 ROUTE_CACHE_TTL_DAYS）。
 *
 * 除 plans 之外全是视图状态，只存内存：刷新回到"不画线"的干净状态。
 */

export type RoutePlanState =
  | { status: "loading" }
  | { status: "ready"; plan: RoutePlan }
  | { status: "empty" } // 高德确认没有方案（如跨城公交）
  | { status: "error" }; // 查询本身没成功（超时/插件/网络），跟"没方案"不是一回事

interface RoutesContextValue {
  /** 默认交通方式（「更改默认设置」做完之前固定驾车） */
  defaultMode: RouteMode;
  /** 整趟行程所在的城市（仅公交查询用；不给则公交一律没方案） */
  city: string | null;
  /** 查询结果，键见 routeKey */
  plans: Record<string, RoutePlanState>;
  /** 幂等：正在查或查过了就直接返回，不会重复打请求 */
  ensurePlan: (
    key: string,
    from: RoutePoint,
    to: RoutePoint,
    mode: RouteMode,
  ) => void;
  /** 图层级总开关：打开 = 打开图层里所有间隔的线都画出来 */
  showRoutes: boolean;
  setShowRoutes: Dispatch<SetStateAction<boolean>>;
  /** 被单独"隐藏路线"的间隔（gapKey） */
  hiddenGaps: Set<string>;
  hideGap: (gap: string) => void;
  showGap: (gap: string) => void;
}

const RoutesContext = createContext<RoutesContextValue | null>(null);

interface RoutesProviderProps {
  children: ReactNode;
  /** 本行程 id（路线缓存按行程归属，跟着行程一起删） */
  tripId: string;
  /** 服务端读出来的 route_plans 缓存初值 */
  initialPlans: CachedRoutePlan[];
  /**
   * 行程目的地城市名，只有公交路径规划用得上。
   * 高德的 Transfer 必须有城市，否则一律 no_data；但它只用它来选公交库，
   * 不校验坐标是否同城 —— 传"武汉"查两个北京地点照样有方案，
   * 所以这里图省事直接给行程目的地（出差飞出去那段也一样能出结果）。
   */
  city?: string | null;
}

/** 库里的一行 → 内存表里的一个状态 */
function seedState(plan: RoutePlan | null): RoutePlanState {
  return plan ? { status: "ready", plan } : { status: "empty" };
}

export function RoutesProvider({
  children,
  tripId,
  initialPlans,
  city = null,
}: RoutesProviderProps) {
  const [defaultMode] = useState<RouteMode>(DEFAULT_ROUTE_MODE);
  // 默认不画：一进行程就把所有间隔 × 三种模式查一遍太费配额（见 useInView 的懒加载）
  const [showRoutes, setShowRoutes] = useState(false);
  const [hiddenGaps, setHiddenGaps] = useState<Set<string>>(() => new Set());

  /**
   * 缓存本体。用 useState 的惰性初值拿一个"跨渲染稳定"的可变 Map：
   * 内容随时改（所以不能直接放 state），改动靠 version 触发重渲染。
   * TripWorkspace 上挂了 key={trip.id}，换行程时整个 Provider 重挂，不会串。
   */
  const [cache] = useState(() => {
    const map = new Map<string, RoutePlanState>();
    for (const cached of initialPlans) {
      map.set(cached.routeKey, seedState(cached.plan));
    }
    return map;
  });
  const [version, bumpVersion] = useReducer((v: number) => v + 1, 0);

  const ensurePlan = useCallback(
    (key: string, from: RoutePoint, to: RoutePoint, mode: RouteMode) => {
      // 查过（含正在查、含从库里带出来的）就不再发请求 —— 同一条路线切来切去也只打一次
      if (cache.has(key)) return;
      cache.set(key, { status: "loading" });
      bumpVersion();

      requestRoutePlan(from, to, mode, city)
        .then((res) => {
          if (!res.ok) {
            // 查询本身没成功。只标这一屏，**不入库** ——
            // 一次超时要是被记成"无方案"，这条路线就得错到缓存过期为止。
            cache.set(key, { status: "error" });
            return;
          }
          cache.set(key, seedState(res.plan));

          // 回写库。res.plan 为 null 也写（那是"高德确认没有方案"的负缓存），
          // 但**解析不出折线的方案不写**：这种行一旦落库，地图就再也画不出线，
          // 又因为命中缓存不会重查，等于把一个解析 bug 冻到缓存过期为止。
          // 不缓存它，下次进来还会重查一次（费一点配额，换"能自愈 + 能看见告警"）。
          const worthCaching = res.plan === null || res.plan.path.length >= 2;
          if (worthCaching) {
            // 不 await：入库失败不该影响这一屏已经拿到的结果
            saveRoutePlan(tripId, key, mode, res.plan).catch((err) =>
              console.warn("路线缓存入库失败:", err),
            );
          }
        })
        .catch(() => cache.set(key, { status: "error" }))
        .finally(bumpVersion);
    },
    [cache, city, tripId],
  );

  const hideGap = useCallback((gap: string) => {
    setHiddenGaps((prev) => {
      if (prev.has(gap)) return prev;
      const next = new Set(prev);
      next.add(gap);
      return next;
    });
  }, []);

  const showGap = useCallback((gap: string) => {
    setHiddenGaps((prev) => {
      if (!prev.has(gap)) return prev;
      const next = new Set(prev);
      next.delete(gap);
      return next;
    });
  }, []);

  const plans = useMemo(
    () => Object.fromEntries(cache),
    // version 每写一次缓存就 +1（值本身用不到，只作失效信号）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const value = useMemo(
    () => ({
      defaultMode,
      city,
      plans,
      ensurePlan,
      showRoutes,
      setShowRoutes,
      hiddenGaps,
      hideGap,
      showGap,
    }),
    [
      defaultMode,
      city,
      plans,
      ensurePlan,
      showRoutes,
      hiddenGaps,
      hideGap,
      showGap,
    ],
  );

  return (
    <RoutesContext.Provider value={value}>{children}</RoutesContext.Provider>
  );
}

export function useRoutes(): RoutesContextValue {
  const ctx = useContext(RoutesContext);
  if (!ctx) throw new Error("useRoutes 必须在 RoutesProvider 内使用");
  return ctx;
}
