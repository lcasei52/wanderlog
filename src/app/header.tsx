"use client";

import Link from "next/link";
import {
  Bell,
  Map,
  Search,
  User,
  Settings,
  Languages,
  History,
  LogOut,
} from "lucide-react";
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

/*
 * 头部右侧的三颗圆钮（搜索 / 通知 / 头像）尺寸都是 36px：
 * Button 的 size="icon-lg" 就是 size-9，头像也是 h-9。
 *
 * ★ 铃铛和搜索图标里写的是 size-5，不能写成 h-5 w-5。
 *   Button 基类有一条 [&_svg:not([class*='size-'])]:size-4，它是**变体包裹**的规则，
 *   在样式表里排在普通 h/w 工具类之后，同权重下必胜 —— h-5 w-5 会被它压回 16px。
 *   （TripWorkspace 里那颗 AI 胶囊也是同一个坑，那边注释已经记过一次。）
 *
 * ★ 触发钮一律用 Popover 而不是自己 toggle 一个 div：点外面关、Esc 关、焦点管理
 *   都是 Radix 给的。手写的话两处（搜索、通知）就得各挂一套 document 监听。
 */

export default function Header() {
  const [notifications] = useState([
    { id: 1, text: "新的旅行推荐：巴黎浪漫之旅", time: "2小时前" },
    { id: 2, text: "你的朋友邀请你加入行程", time: "5小时前" },
    { id: 3, text: "系统更新：新增AI行程规划功能", time: "1天前" },
  ]);

  // 手机端搜索弹层打开后要把焦点直接给输入框，见下面 onOpenAutoFocus
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 临时用户名，后续从登录状态获取
  const username = "traveler";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      {/* app-shell：壳跟正文列同一个（见 globals.css），不然头部和下面的内容对不齐 */}
      <div className="app-shell flex h-16 items-center justify-between">
        {/* 左侧：Logo + 标题 + 导航 */}
        <div className="flex items-center gap-6">
          {/*
            Logo 和标题在手机上都要留着。"旅行规划"这四个字原来是 hidden sm:inline，
            被藏掉了 —— 窄屏左侧只剩一个孤零零的图标，看不出这是个什么站。

            实测 320px 也放得下：图标 24 + gap-2 8 + 「旅行规划」4 字 ×18 = 104px；
            右侧三颗 36px 圆钮 + 两个 gap-3 = 132px；合计 236px，
            而 320px 屏减去外壳 px-6 后还有 272px。
          */}
          <Link
            href="/home"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Map className="h-12 w-12 text-orange-500" />
            <span className="font-semibold text-lg">旅行规划</span>
          </Link>

          {/*
            导航链接。md 以下塞不下 —— 左侧已经占了 104px、右边三颗钮 132px，
            320px 上只剩 36px。手机要导航得另做汉堡菜单（改的是布局不是这一行的类名），
            所以这里保持 hidden md:flex 不动。
          */}
          <nav className="hidden md:flex items-center gap-4">
            <Link
              href="/home"
              className="text-sm font-semibold text-gray-700 hover:text-blue-600 transition-colors"
            >
              主页
            </Link>
            <Link
              href="/guides"
              className="text-sm font-semibold text-gray-700 hover:text-blue-600 transition-colors"
            >
              游记
            </Link>
          </nav>
        </div>

        {/* 右侧：搜索 + 通知 + 用户 */}
        <div className="flex items-center gap-3">
          {/*
            桌面：常驻搜索框。
            ★ 这一块的 hidden sm:block 和下面手机那颗搜索钮的 sm:hidden 是**一对**，
              两边断点必须同时改 —— 只改一边会在断点两侧出现"两个搜索框"或"一个都没有"。
          */}
          <div className="hidden sm:block w-48 lg:w-64">
            <Input type="search" placeholder="输入搜索的旅行" className="h-9" />
          </div>

          {/* 手机：搜索框换成一枚图标，点开才有输入框 */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-lg"
                className="sm:hidden"
                aria-label="搜索"
              >
                <Search className="size-5 text-gray-700" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              collisionPadding={16}
              className="w-[calc(100vw-2rem)] p-2 sm:hidden"
              onOpenAutoFocus={(e) => {
                /*
                 * Radix 默认把焦点给弹层本身。触摸设备上没有 hover，那样点完图标
                 * 还得再点一次输入框才出键盘 —— 拦下来直接递给 input，点一下就能打字。
                 * （桌面鼠标下是"点图标 → 光标已在框里"，两处体验一致。）
                 */
                e.preventDefault();
                searchInputRef.current?.focus();
              }}
            >
              <Input
                ref={searchInputRef}
                type="search"
                placeholder="输入搜索的旅行"
                className="h-9"
              />
            </PopoverContent>
          </Popover>

          {/*
            通知铃铛。

            原来是手写的 <button> + 同层一个 absolute 的 div，有两个毛病：
              ① 点外面不关、Esc 也不关，只能再点一次铃铛；
              ② 弹窗宽度写死 320px 且 right-0 挂在铃铛上，而铃铛右边缘到屏幕边只剩
                 gap-3 12 + 头像 36 + 外壳 px-6 24 = 72px —— 375px 手机上弹窗左沿算到
                 −17px，整整 17px 在屏幕外（320px 屏上是 −72px）。header 里没有
                 overflow-hidden，这就是实打实的横向滚动条，一开通知整页横着晃。

            换成 Popover 后两件事一起解决：dismiss 由 Radix 管；
            横向由 collisionPadding 管 —— Radix 会把弹层挪进视口，比原来手算 max-w 稳。

            窄到 320px 时视口本身就装不下 320px 的弹窗，Radix 挪也没用，
            所以 max-w-[calc(100vw-2rem)] 还得留着兜底（2rem = 左右各 16px，
            跟上面的 collisionPadding 取同一个数，两者才是同一条边）。

            另一处顺带的好处：展开时 Radix 给触发钮挂 aria-expanded，
            而 Button 的 ghost 变体里本来就有 aria-expanded:bg-muted ——
            点开的那颗钮自带"按下去"的高亮，不用另外加类名。
          */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-lg"
                className="relative"
                aria-label="通知"
              >
                <Bell className="size-5 text-gray-700" />
                {notifications.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
                    {notifications.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              collisionPadding={16}
              className="w-80 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0"
            >
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
            </PopoverContent>
          </Popover>

          {/* 用户头像下拉菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full">
                <Avatar className="h-9 w-9 cursor-pointer hover:ring-2 hover:ring-gray-300 transition-all">
                  <AvatarImage
                    src="https://github.com/shadcn.png"
                    alt="用户头像"
                  />
                  <AvatarFallback>用户</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link
                  href={`/${username}`}
                  className="cursor-pointer flex items-center gap-2"
                >
                  <User className="h-4 w-4" />
                  <span>个人资料</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="/settings"
                  className="cursor-pointer flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  <span>设置</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="/language"
                  className="cursor-pointer flex items-center gap-2"
                >
                  <Languages className="h-4 w-4" />
                  <span>语言</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="/history"
                  className="cursor-pointer flex items-center gap-2"
                >
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
