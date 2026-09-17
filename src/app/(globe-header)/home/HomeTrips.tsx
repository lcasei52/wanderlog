"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteTrip } from "@/actions/trips";

/** Home 卡片所需的行程字段（对应 trips 表主干，可序列化） */
export interface HomeTrip {
  id: string;
  name: string;
  startDate: string | null; // "YYYY-MM-DD"
  endDate: string | null;
  destinationName?: string | null;
  coverImageUrl?: string | null;
  coverImageData?: string | null;
}

/** "2024-03-15" -> "3月15日" */
function fmtMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

function rangeText(t: HomeTrip): string {
  if (t.startDate && t.endDate) {
    return `${fmtMonthDay(t.startDate)} - ${fmtMonthDay(t.endDate)}`;
  }
  return "未设置日期";
}

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function HomeTrips({ trips }: { trips: HomeTrip[] }) {
  const router = useRouter();
  const [tripsState, setTripsState] = useState(trips);
  const [viewMode, setViewMode] = useState<"recent" | "upcoming">("recent");
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(4);
  const [deletingTrip, setDeletingTrip] = useState<HomeTrip | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 服务端数据刷新（如删除后 router.refresh）后同步 prop -> state
  useEffect(() => {
    setTripsState(trips);
  }, [trips]);

  // 按屏幕宽度动态决定每页几张
  useEffect(() => {
    const updateItemsPerPage = () => {
      const width = window.innerWidth;
      if (width < 768)
        setItemsPerPage(2); // 小屏
      else if (width < 1024)
        setItemsPerPage(3); // 中屏
      else setItemsPerPage(4); // 大屏
    };
    updateItemsPerPage();
    window.addEventListener("resize", updateItemsPerPage);
    return () => window.removeEventListener("resize", updateItemsPerPage);
  }, []);

  // 每页数量变化时回到第一页
  useEffect(() => {
    setCurrentPage(0);
  }, [itemsPerPage]);

  // "即将到来的旅行"：还没结束的行程，按开始日期近的优先
  const visibleTrips =
    viewMode === "upcoming"
      ? tripsState
          .filter((t) => !t.endDate || t.endDate >= todayStr())
          .sort((a, b) =>
            (a.startDate ?? "9999-12-31").localeCompare(
              b.startDate ?? "9999-12-31",
            ),
          )
      : tripsState;

  const totalPages = Math.max(1, Math.ceil(visibleTrips.length / itemsPerPage));
  const currentTrips = visibleTrips.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage,
  );

  // 删掉最后一页的最后一张卡片时，把页码收回来
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages - 1));
  }, [totalPages]);

  const handleShare = async (trip: HomeTrip) => {
    const url = `${window.location.origin}/plan/${trip.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("行程链接已复制");
    } catch {
      toast.error("复制失败，请手动复制地址");
    }
  };

  const handleDelete = async () => {
    if (!deletingTrip) return;
    setIsDeleting(true);
    try {
      await deleteTrip(deletingTrip.id);
      // 先本地移除，再用 router.refresh 让服务端重新取一次对齐
      setTripsState((prev) => prev.filter((t) => t.id !== deletingTrip.id));
      toast.success("行程已删除");
      router.refresh();
    } catch {
      toast.error("删除失败，请重试");
    } finally {
      setIsDeleting(false);
      setDeletingTrip(null);
    }
  };

  return (
    <div className="app-shell py-8">
      <section className="mb-12">
        {/* 标题行 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900">我的行程</h1>
          <Link href="/plan/create">
            <Button className="bg-orange-500 hover:bg-orange-600 rounded-full px-6">
              <Plus className="h-4 w-4 mr-2" />
              计划新行程
            </Button>
          </Link>
        </div>

        {/* 筛选行：左侧视图切换，右侧"查看全部"入口 */}
        <div className="flex items-center justify-between mb-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
                <span>
                  {viewMode === "recent" ? "最近创建" : "即将到来的旅行"}
                </span>
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setViewMode("recent")}>
                最近创建
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode("upcoming")}>
                即将到来的旅行
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-sm text-orange-600 hover:text-orange-700 font-medium">
                查看全部
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/traveler/trips`}>行程</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/traveler/guides`}>旅行指南</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/traveler/journals`}>您的旅行游记</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 旅行卡片 */}
        <div className="relative">
          {currentTrips.length === 0 ? (
            <div className="bg-white rounded-lg border border-dashed p-12 text-center text-gray-400">
              {viewMode === "upcoming"
                ? "暂无即将到来的行程"
                : "还没有行程，点右上角「计划新行程」开始吧"}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr">
                {currentTrips.map((trip) => (
                  <div
                    key={trip.id}
                    className="group relative bg-white rounded-lg border hover:shadow-lg transition-shadow overflow-hidden"
                  >
                    <Link
                      href={`/plan/${trip.id}`}
                      className="block cursor-pointer"
                    >
                      {/* 卡片图片区域 */}
                      <div className="relative aspect-[4/3]">
                        {trip.coverImageUrl || trip.coverImageData ? (
                          <Image
                            src={trip.coverImageUrl || trip.coverImageData!}
                            alt={trip.name}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center">
                            <span className="text-gray-400 text-sm">
                              封面图片
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 卡片信息 */}
                      <div className="p-3">
                        <h3 className="font-semibold text-gray-900 mb-2 group-hover:text-orange-600 transition-colors line-clamp-1">
                          {trip.name}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          {trip.destinationName ? (
                            <span className="text-orange-600">
                              {trip.destinationName}
                            </span>
                          ) : null}
                          <span>{rangeText(trip)}</span>
                        </div>
                      </div>
                    </Link>

                    {/* 右上角 "..." 菜单（与 Link 是兄弟节点，避免嵌套可点击元素） */}
                    <div className="absolute top-2 right-2 z-10">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full bg-white/90 shadow-sm hover:bg-white"
                            aria-label="更多操作"
                          >
                            <MoreVertical className="h-4 w-4 text-gray-700" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleShare(trip)}>
                            <Share2 className="h-4 w-4" />
                            分享
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => setDeletingTrip(trip)}
                          >
                            <Trash2 className="h-4 w-4" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>

              {/* 翻页箭头 */}
              {totalPages > 1 && (
                <>
                  {currentPage > 0 && (
                    <div className="absolute -left-12 top-1/2 -translate-y-1/2">
                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.max(0, p - 1))
                        }
                        className="h-10 w-10 rounded-full bg-white border shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all"
                        aria-label="上一页"
                      >
                        <ChevronLeft className="h-5 w-5 text-gray-600" />
                      </button>
                    </div>
                  )}
                  {currentPage < totalPages - 1 && (
                    <div className="absolute -right-12 top-1/2 -translate-y-1/2">
                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
                        }
                        className="h-10 w-10 rounded-full bg-white border shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all"
                        aria-label="下一页"
                      >
                        <ChevronRight className="h-5 w-5 text-gray-600" />
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* 分页指示器 */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  {Array.from({ length: totalPages }).map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentPage(index)}
                      className={`h-2 rounded-full transition-all ${
                        index === currentPage
                          ? "w-8 bg-orange-500"
                          : "w-2 bg-gray-300 hover:bg-gray-400"
                      }`}
                      aria-label={`第 ${index + 1} 页`}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* 第二块：预留空间 */}
      <section>
        <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
          <p className="text-gray-400">第二块内容区域</p>
        </div>
      </section>

      {/* 删除确认对话框 */}
      <Dialog
        open={!!deletingTrip}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeletingTrip(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除这个行程？</DialogTitle>
            <DialogDescription>
              将删除「{deletingTrip?.name}
              」及其中的列表、每日行程、航班酒店等内容，此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isDeleting}
              onClick={() => setDeletingTrip(null)}
            >
              取消
            </Button>
            <Button
              disabled={isDeleting}
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? "删除中…" : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
