"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// 模拟数据 - 后续从数据库获取
const mockTrips = [
  {
    id: 1,
    name: "前往西宁的旅行",
    coverImage: "",
    username: "旅行者",
    userAvatar: "https://github.com/shadcn.png",
    startDate: "2024-03-15",
    endDate: "2024-03-20",
  },
  {
    id: 2,
    name: "巴黎浪漫之旅",
    coverImage: "",
    username: "旅行者",
    userAvatar: "https://github.com/shadcn.png",
    startDate: "2024-04-01",
    endDate: "2024-04-10",
  },
  {
    id: 3,
    name: "东京樱花季",
    coverImage: "",
    username: "旅行者",
    userAvatar: "https://github.com/shadcn.png",
    startDate: "2024-03-25",
    endDate: "2024-03-30",
  },
  {
    id: 4,
    name: "云南丽江古城游",
    coverImage: "",
    username: "旅行者",
    userAvatar: "https://github.com/shadcn.png",
    startDate: "2024-05-01",
    endDate: "2024-05-05",
  },
  {
    id: 5,
    name: "成都美食之旅",
    coverImage: "",
    username: "旅行者",
    userAvatar: "https://github.com/shadcn.png",
    startDate: "2024-06-10",
    endDate: "2024-06-15",
  },
  {
    id: 6,
    name: "新疆自驾游",
    coverImage: "",
    username: "旅行者",
    userAvatar: "https://github.com/shadcn.png",
    startDate: "2024-07-01",
    endDate: "2024-07-15",
  },
];

export default function HomePage() {
  const [viewMode, setViewMode] = useState<"recent" | "upcoming">("recent");
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(4);

  // 临时用户名，后续从登录状态获取
  const username = "traveler";

  // 根据屏幕尺寸动态调整每页显示数量
  useEffect(() => {
    const updateItemsPerPage = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setItemsPerPage(2); // 小屏：2个
      } else if (width < 1024) {
        setItemsPerPage(3); // 中屏：3个
      } else {
        setItemsPerPage(4); // 大屏：4个
      }
    };

    updateItemsPerPage();
    window.addEventListener("resize", updateItemsPerPage);
    return () => window.removeEventListener("resize", updateItemsPerPage);
  }, []);

  // 当 itemsPerPage 改变时，重置到第一页
  useEffect(() => {
    setCurrentPage(0);
  }, [itemsPerPage]);

  // 计算当前显示的行程
  const totalPages = Math.ceil(mockTrips.length / itemsPerPage);
  const currentTrips = mockTrips.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage,
  );

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 第一块：最近浏览和即将到来的旅行 */}
      <section className="mb-12">
        {/* 标题行 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900">
            最近浏览和即将到来的旅行
          </h1>
          <Link href="/plan/create">
            <Button className="bg-orange-500 hover:bg-orange-600 rounded-full px-6">
              <Plus className="h-4 w-4 mr-2" />
              计划新行程
            </Button>
          </Link>
        </div>

        {/* 筛选行 */}
        <div className="flex items-center justify-between mb-6">
          {/* 左侧：视图切换 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
                <span>
                  {viewMode === "recent" ? "最近浏览" : "即将到来的旅行"}
                </span>
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setViewMode("recent")}>
                最近浏览
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode("upcoming")}>
                即将到来的旅行
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 右侧：查看全部 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-sm text-orange-600 hover:text-orange-700 font-medium">
                查看全部
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/${username}/trips`}>行程</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/${username}/guides`}>旅行指南</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/${username}/journals`}>您的旅行游记</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 旅行卡片网格 - 固定一行，响应式列数 */}
        <div className="relative">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr">
            {currentTrips.map((trip) => (
              <Link
                key={trip.id}
                href={`/plan/${trip.id}`}
                className="group cursor-pointer"
              >
                <div className="bg-white rounded-lg border hover:shadow-lg transition-shadow overflow-hidden">
                  {/* 卡片图片区域 */}
                  <div className="aspect-[4/3] bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center">
                    <span className="text-gray-400 text-sm">封面图片</span>
                  </div>

                  {/* 卡片信息 */}
                  <div className="p-3">
                    <h3 className="font-semibold text-gray-900 mb-2 group-hover:text-orange-600 transition-colors line-clamp-1">
                      {trip.name}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={trip.userAvatar} />
                        <AvatarFallback>{trip.username[0]}</AvatarFallback>
                      </Avatar>
                      <span>
                        {trip.startDate} - {trip.endDate}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* 翻页箭头 */}
          {totalPages > 1 && (
            <>
              {/* 向左箭头 */}
              {currentPage > 0 && (
                <div className="absolute -left-12 top-1/2 -translate-y-1/2">
                  <button
                    onClick={handlePrevPage}
                    className="h-10 w-10 rounded-full bg-white border shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all"
                  >
                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                  </button>
                </div>
              )}

              {/* 向右箭头 */}
              {currentPage < totalPages - 1 && (
                <div className="absolute -right-12 top-1/2 -translate-y-1/2">
                  <button
                    onClick={handleNextPage}
                    className="h-10 w-10 rounded-full bg-white border shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all"
                  >
                    <ChevronRight className="h-5 w-5 text-gray-600" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

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
              />
            ))}
          </div>
        )}
      </section>

      {/* 第二块：预留空间 */}
      <section>
        <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
          <p className="text-gray-400">第二块内容区域</p>
        </div>
      </section>
    </div>
  );
}
