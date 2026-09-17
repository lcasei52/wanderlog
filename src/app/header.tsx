"use client";

import Link from "next/link";
import { Bell, Map, User, Settings, Languages, History, LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

export default function Header() {
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications] = useState([
    { id: 1, text: "新的旅行推荐：巴黎浪漫之旅", time: "2小时前" },
    { id: 2, text: "你的朋友邀请你加入行程", time: "5小时前" },
    { id: 3, text: "系统更新：新增AI行程规划功能", time: "1天前" },
  ]);

  // 临时用户名，后续从登录状态获取
  const username = "traveler";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      {/* app-shell：壳跟正文列同一个（见 globals.css），不然头部和下面的内容对不齐 */}
      <div className="app-shell flex h-16 items-center justify-between">
        {/* 左侧：Logo + 导航 */}
        <div className="flex items-center gap-6">
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Map className="h-6 w-6 text-orange-500" />
            <span className="font-semibold text-lg hidden sm:inline">旅行规划</span>
          </Link>

          {/* 导航链接 */}
          <nav className="hidden md:flex items-center gap-4">
            <Link
              href="/home"
              className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
            >
              主页
            </Link>
            <Link
              href="/guides"
              className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
            >
              旅行指南
            </Link>
          </nav>
        </div>

        {/* 右侧：搜索 + 通知 + 用户 */}
        <div className="flex items-center gap-3">
          {/* 搜索框 */}
          <div className="hidden sm:block w-48 lg:w-64">
            <Input
              type="search"
              placeholder="输入搜索的旅行"
              className="h-9"
            />
          </div>

          {/* 通知铃铛 */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Bell className="h-5 w-5 text-gray-700" />
              {notifications.length > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
                  {notifications.length}
                </Badge>
              )}
            </button>

            {/* 通知弹窗 */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border overflow-hidden">
                <div className="p-3 border-b bg-gray-50">
                  <h3 className="font-semibold text-sm">通知</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm">
                      暂无通知
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 transition-colors"
                      >
                        <p className="text-sm text-gray-800">{notif.text}</p>
                        <p className="text-xs text-gray-500 mt-1">{notif.time}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-2 border-t bg-gray-50">
                  <button className="w-full text-center text-sm text-blue-600 hover:text-blue-700 py-1">
                    查看全部通知
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 用户头像下拉菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full">
                <Avatar className="h-9 w-9 cursor-pointer hover:ring-2 hover:ring-gray-300 transition-all">
                  <AvatarImage src="https://github.com/shadcn.png" alt="用户头像" />
                  <AvatarFallback>用户</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href={`/${username}`} className="cursor-pointer flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>个人资料</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span>设置</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/language" className="cursor-pointer flex items-center gap-2">
                  <Languages className="h-4 w-4" />
                  <span>语言</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/history" className="cursor-pointer flex items-center gap-2">
                  <History className="h-4 w-4" />
                  <span>历史</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 cursor-pointer flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                <span>退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
