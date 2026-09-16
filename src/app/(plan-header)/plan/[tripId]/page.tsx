import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  trips,
  flights,
  hotels,
  lists,
  placeItems,
  notes,
  tripMembers,
  expenses,
  type Flight,
  type Hotel,
  type List,
  type PlaceItem,
  type Note,
  type TripMember,
  type Expense,
} from "@/db/schema";
import { ensureTripPlaceLists } from "@/db/trip-place-lists";
import { ensureTripSelfMember, SELF_MEMBER_EMAIL } from "@/db/trip-members";
import { withRetry } from "@/db/retry";
import { loadRoutePlans } from "@/db/route-plans";
import type { CachedRoutePlan } from "@/lib/place-route";
import type { TripSummary } from "@/types/trip";
import TripWorkspace from "../components/TripWorkspace";

/*
 * 每次请求都现渲染，不做整页缓存。
 *
 * 这个页面上的数据分两类：一类客户端有完整副本（地点/费用/航班/住宿/成员/笔记，
 * 各自的 context 拿下面这些 props 只当**初值**），另一类是真从服务端 props 读的
 * （行程名/封面/图层初值/预算）。前一类对应的 action 现在全都不再 revalidatePath
 * —— 但那样一来，服务端这份渲染结果就再没人来作废它了，万一 Next 把它当静态页
 * 缓存住，F5 会直接吃到旧的 HTML。force-dynamic 把这条堵死：永远现算。
 * （/home 也是这么写的。）
 *
 * 代价是每次进这个页面都要跑下面那 8 条查询；换来的是"这一页永远反映库里的当前
 * 状态"这条不用推断的事实。要是哪天嫌 F5 慢，删掉这一行之前先去看 revalidatePath
 * 那条规矩（actions/trips.ts 里 updateTripBudget 上方）。
 */
export const dynamic = "force-dynamic";

// 把 DB 行转成可传给客户端组件的快照
function toTripSummary(row: {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  destinationName: string | null;
  destinationLng: number | null;
  destinationLat: number | null;
  destinationType: string | null;
  coverImageUrl: string | null;
  coverImageData: string | null;
  budget: number | null;
  budgetCurrency: string | null;
}): TripSummary {
  const hasCoords =
    row.destinationName && row.destinationLng != null && row.destinationLat != null;

  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    destination: hasCoords
      ? {
          name: row.destinationName!,
          type: (row.destinationType ?? "city") as "city" | "province" | "country",
          location: { lng: row.destinationLng!, lat: row.destinationLat! },
        }
      : undefined,
    coverImageUrl: row.coverImageUrl,
    coverImageData: row.coverImageData,
    budget: row.budget,
    budgetCurrency: row.budgetCurrency,
  };
}

/**
 * 首屏这一次 trip 查询。
 * 用 cache() 包起来是因为 generateMetadata 也要行程名 —— 不包的话一次页面加载
 * 会往 Neon 打两次同样的查询，而每多一次查询就多一趟到 Neon 的往返
 * （neon-http 每次查询一个 HTTP 请求，开销在往返本身，见 db/client.ts）。
 * cache() 只在这一个请求内去重，不跨请求，不会拿到旧数据。
 */
const getTripRow = cache(async (tripId: string) => {
  const db = getDb();
  /*
   * 重试必须在 cache() **里面**：cache() 缓存的是这个 promise 本身，若从外面
   * 重试，拿到的是同一个已经 reject 的 promise，重试等于没做。
   */
  const rows = await withRetry(() =>
    db
      .select({
        id: trips.id,
        name: trips.name,
        startDate: trips.startDate,
        endDate: trips.endDate,
        destinationName: trips.destinationName,
        destinationLng: trips.destinationLng,
        destinationLat: trips.destinationLat,
        destinationType: trips.destinationType,
        coverImageUrl: trips.coverImageUrl,
        coverImageData: trips.coverImageData,
        // 预算：BudgetCard 的进度条用；为 null 表示不设预算
        budget: trips.budget,
        budgetCurrency: trips.budgetCurrency,
        // 地图图层里被关掉的那些（初值，之后由 MapView 自己读写）
        hiddenLayers: trips.hiddenLayers,
      })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1),
  );
  return rows[0] ?? null;
});

// 标签页标题：图案（src/app/icon.svg）+ 行程名
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tripId: string }>;
}): Promise<Metadata> {
  const { tripId } = await params;
  const row = await getTripRow(tripId);
  return { title: row?.name ?? "行程" };
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  const db = getDb();

  /*
   * 首屏这几张表一次并发读完。
   * 以前是 6 次串行，注释给的理由是"避免并发连接限制（只允许 1 个连接）"——
   * 那个理由不成立（见 db/client.ts）：neon-http 每次查询就是一个独立的 HTTPS
   * 请求，没有连接可占。串行的代价是延迟按查询数**相加**，并发则是**取最大**，
   * 本机到 Neon 一趟往返要一两秒，这一项就是十几秒的差别。
   *
   * 顺序上只有一个约束：这批读完成后，才轮到 ensureTripPlaceLists 那个写。
   *
   * 每个读各自套 withRetry（而不是把整个 Promise.all 包一层）：一次连接抖动只
   * 会挂掉其中一个，包整批会让另外 7 个已经成功的白跑一遍。这也是"偶发进页面
   * 直接跳红字错误界面"的正面修复 —— 以前任何一个读失败，整页就没有了。
   */
  const [row, flightRows, hotelRows, itemRows, noteRows, fetchedListRows, fetchedMemberRows, expenseRows] =
    await Promise.all([
      getTripRow(tripId),
      // position 是拖拽排序的落库顺序；旧数据 position 全为 0，靠 createdAt 兜底保持原顺序
      withRetry(() =>
        db
          .select()
          .from(flights)
          .where(eq(flights.tripId, tripId))
          .orderBy(asc(flights.position), asc(flights.createdAt)),
      ),
      withRetry(() =>
        db
          .select()
          .from(hotels)
          .where(eq(hotels.tripId, tripId))
          .orderBy(asc(hotels.position), asc(hotels.createdAt)),
      ),
      withRetry(() =>
        db
          .select()
          .from(placeItems)
          .where(eq(placeItems.tripId, tripId))
          .orderBy(asc(placeItems.createdAt)),
      ),
      withRetry(() =>
        db
          .select()
          .from(notes)
          .where(eq(notes.tripId, tripId))
          .orderBy(asc(notes.position), asc(notes.createdAt)),
      ),
      withRetry(() =>
        db
          .select()
          .from(lists)
          .where(eq(lists.tripId, tripId))
          .orderBy(asc(lists.position)),
      ),
      withRetry(() =>
        db
          .select()
          .from(tripMembers)
          .where(eq(tripMembers.tripId, tripId))
          .orderBy(asc(tripMembers.position), asc(tripMembers.createdAt)),
      ),
      withRetry(() =>
        db
          .select()
          .from(expenses)
          .where(eq(expenses.tripId, tripId))
          .orderBy(asc(expenses.position), asc(expenses.createdAt)),
      ),
    ]);

  if (!row) {
    notFound();
  }

  const trip = toTripSummary(row);

  /*
   * 保证至少有一个默认地点列表（兼容已建行程）。
   * 上面那批已经把 lists 读回来了，通常直接用它判断就够 —— ensureTripPlaceLists
   * 内部查的是同一张表，再调一次等于白跑一趟往返。只有列表真的为空时才走那条路。
   */
  let listRows = fetchedListRows;
  if (listRows.length === 0) {
    await ensureTripPlaceLists(tripId);
    listRows = await withRetry(() =>
      db
        .select()
        .from(lists)
        .where(eq(lists.tripId, tripId))
        .orderBy(asc(lists.position)),
    );
  }

  /*
   * 保证每个行程都有「我」那一行（兼容改造前建的行程）。
   * 判断条件**不是"成员为空"** —— 老行程往往已经有被邀请的伙伴，缺的恰恰是
   * 「我」自己（expenses.paid_by 是 notNull 外键，没有成员就记不了费用），
   * 所以按哨兵邮箱找。和上面那个一样：真缺时才走确保那条路。
   * 插完要重读一遍，因为腾 position 0 时把别人的 position 也改了，手里这份是旧的。
   */
  let memberRows = fetchedMemberRows;
  if (!memberRows.some((m) => m.email === SELF_MEMBER_EMAIL)) {
    await ensureTripSelfMember(tripId);
    memberRows = await withRetry(() =>
      db
        .select()
        .from(tripMembers)
        .where(eq(tripMembers.tripId, tripId))
        .orderBy(asc(tripMembers.position), asc(tripMembers.createdAt)),
    );
  }

  // 已查过的路线（时长/距离/折线）跟着首屏一起下来，前端就不必再问一次高德
  // 临时注释：Neon 查询超时，先让页面能打开（路线会在前端重新查高德）
  const routePlanRows: CachedRoutePlan[] = []; // await loadRoutePlans(tripId);

  return (
    <TripWorkspace
      key={trip.id} // 跨行程切换时重挂 PlacesProvider，避免残留上一行程的内存态
      trip={trip}
      flights={flightRows as Flight[]}
      hotels={hotelRows as Hotel[]}
      tripMembers={memberRows as TripMember[]}
      expenses={expenseRows as Expense[]}
      placeItems={itemRows as PlaceItem[]}
      placeLists={listRows as List[]}
      notes={noteRows as Note[]}
      routePlans={routePlanRows}
      hiddenLayers={row.hiddenLayers}
      destinationCenter={
        trip.destination?.location
          ? [trip.destination.location.lng, trip.destination.location.lat]
          : undefined
      }
    />
  );
}
