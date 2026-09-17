"use client";

import { useState, useRef, useEffect, ChangeEvent } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2, Upload, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * 本地图的上限，按**解码后的字节数**算（不是 data URI 那一长串字符的长度）。
 *
 * 640KB 这个数是被两层夹出来的：
 *
 *   1. Next 对 Server Action 的请求体有 1MB 硬上限（默认值，next.config.ts 里没改过）。
 *      本地图是当 `{ data: dataUrl }` 这个参数发过去的，而 base64 会把字节数抬高
 *      4/3 —— 所以 640KB 的图到了线上约是 850KB 的请求体，1MB 以内还留着余量给 JSON
 *      的引号和 tripId。**上限再往上调就会直接撞墙**，症状是 "Body exceeded 1 MB
 *      limit"，而且是在图都读进内存、用户点了「确认使用」之后才炸。踩过一次。
 *   2. 这份 base64 是**常驻**在 trips 那一行上的：page.tsx 每次渲染都把它查出来当
 *      props 发下去（封面还带 priority，直接进 HTML），所以它多大，每次进这个页面、
 *      每次 F5 就要多传多大 —— 而且是两遍（RSC 里一份、img src 一份）。
 *
 * 所以"传不上大图"的正解是**别把图存成 base64**（存文件、库里只留 URL），不是把
 * bodySizeLimit 调大。真要临时放宽，改 next.config.ts 的
 * experimental.serverActions.bodySizeLimit，但上面第 2 条的代价照付。
 */
export const MAX_LOCAL_IMAGE_BYTES = 640 * 1024;

interface UnsplashImage {
  id: string;
  urls: {
    regular: string;
    small: string;
  };
  alt_description: string;
  user: {
    name: string;
    username: string;
  };
}

interface ImagePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (result: { url?: string; data?: string }) => void;
  /** 拿去搜图的词：行程传目的地名（如"武汉"），地点传地点名 */
  searchQuery?: string;
  /** 文案里的宾语，如"行程封面" / "地点图片" */
  subject?: string;
  /**
   * 本地图上限（解码后的字节数）。超出会先尝试压缩，压不下去才报错。
   * 默认 MAX_LOCAL_IMAGE_BYTES —— 别传一个比它大很多的数，理由在那段注释里。
   */
  maxBytes?: number;
}

/** data URI 的 base64 段换算回字节数（头部的 `data:...;base64,` 不算） */
function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

/** 只用于文案，不追求精确 */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 1 ? Math.round(mb) : mb.toFixed(1)}MB`;
}

/**
 * 把图压进 maxBytes。策略：最长边先缩到 1600，然后质量从 0.85 往 0.45 逐档试；
 * 一轮压不下去就把尺寸折半重来，三档到底还超标就返回 null（调用方报错）。
 *
 * 两个坑：canvas 必须先铺白底 —— PNG 的透明区直接转 JPEG 会变成黑块；
 * 每轮都重新 toDataURL 很贵，所以质量档由高到低早退，够用就停。
 */
async function compressToDataUrl(
  file: File,
  maxBytes: number
): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      // 必须是 window.Image —— 这个文件顶上的 `Image` 是 next/image 的组件，不是构造函数
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("图片解码失败"));
      el.src = objectUrl;
    });

    let maxSide = 1600;
    for (let round = 0; round < 3; round++) {
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrlBytes(dataUrl) <= maxBytes) return dataUrl;
      }
      maxSide /= 2;
    }
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function ImagePickerDialog({
  open,
  onOpenChange,
  onSelect,
  searchQuery,
  subject = "图片",
  maxBytes = MAX_LOCAL_IMAGE_BYTES,
}: ImagePickerDialogProps) {
  // 网络图片 tab 状态
  const [images, setImages] = useState<UnsplashImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // 记住"上一次是为哪个词拉的"，而不是一个布尔 —— 这个弹窗现在是共用的，
  // 换成布尔的话，看完 A 地点的图再开 B 地点会一直显示 A 的图（不再重新拉）
  const loadedQueryRef = useRef<string | null>(null);

  // 本地上传 tab 状态
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const query = searchQuery || "travel";

  // 弹窗打开时自动加载图片
  useEffect(() => {
    if (open && loadedQueryRef.current !== query) {
      fetchImages();
    }
  }, [open, query]); // eslint-disable-line react-hooks/exhaustive-deps

  // 切到 network tab 时按需加载（基于 searchQuery 或默认 travel）
  const handleTabChange = async (value: string) => {
    if (value === "network" && loadedQueryRef.current !== query) {
      await fetchImages();
    }
  };

  // 搜索网络图片（固定 9 张，基于 searchQuery 或默认 travel）
  const fetchImages = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/unsplash/search?q=${encodeURIComponent(query)}`
      );
      if (!response.ok) throw new Error("Failed to fetch images");
      const data = await response.json();
      setImages((data.images || []).slice(0, 9)); // 只取前 9 张
      loadedQueryRef.current = query;
    } catch (error) {
      console.error("Failed to fetch images:", error);
      toast.error("加载图片失败，请稍后重试");
      setImages([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 选择网络图片
  const handleSelectNetworkImage = (image: UnsplashImage) => {
    onSelect({ url: image.urls.regular });
    onOpenChange(false);
  };

  // 处理本地文件选择
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reset = () => {
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // 没超上限就原样读进来 —— 不为了"统一"去重编码，白白掉一层画质
    if (file.size <= maxBytes) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setLocalPreview(dataUrl);
      };
      reader.onerror = () => {
        toast.error("读取文件失败");
      };
      reader.readAsDataURL(file);
      return;
    }

    // 超了先压，压得进去就照收 —— 不劳用户自己去改图
    setIsCompressing(true);
    try {
      const dataUrl = await compressToDataUrl(file, maxBytes);
      if (!dataUrl) {
        toast.error(`图片过大，压缩后仍超过 ${formatBytes(maxBytes)}，请换一张`);
        reset();
        return;
      }
      setLocalPreview(dataUrl);
    } catch {
      toast.error("图片处理失败，请换一张试试");
      reset();
    } finally {
      setIsCompressing(false);
    }
  };

  // 确认使用本地图片
  const handleConfirmLocal = () => {
    if (localPreview) {
      onSelect({ data: localPreview });
      onOpenChange(false);
      setLocalPreview(null);
    }
  };

  // 重置本地选择
  const handleResetLocal = () => {
    setLocalPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>选择{subject}</DialogTitle>
        </DialogHeader>

        <Tabs
          defaultValue="network"
          className="flex-1 flex flex-col min-h-0"
          onValueChange={handleTabChange}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="network">网络图片</TabsTrigger>
            <TabsTrigger value="upload">本地上传</TabsTrigger>
          </TabsList>

          {/* 网络图片 tab */}
          <TabsContent value="network" className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                </div>
              ) : images.length > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {images.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => handleSelectNetworkImage(img)}
                      className="group relative aspect-[4/3] rounded-lg overflow-hidden border-2 border-transparent hover:border-orange-500 transition-all"
                    >
                      <Image
                        src={img.urls.small}
                        alt={img.alt_description}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end p-2">
                        <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity truncate">
                          by {img.user.name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Search className="h-12 w-12 mb-2" />
                  <p>
                    {searchQuery ? `暂无「${searchQuery}」相关图片` : "暂无图片"}
                  </p>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 mt-4">
              图片来自{" "}
              <a
                href="https://unsplash.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-600"
              >
                Unsplash
              </a>
            </p>
          </TabsContent>

          {/* 本地上传 tab */}
          <TabsContent value="upload" className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              {localPreview ? (
                <>
                  <div className="relative w-full max-w-md aspect-[4/3] rounded-lg overflow-hidden border">
                    <Image
                      src={localPreview}
                      alt="预览"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleResetLocal}>
                      重新选择
                    </Button>
                    <Button
                      className="bg-orange-500 hover:bg-orange-600"
                      onClick={handleConfirmLocal}
                    >
                      确认使用
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-24 w-24 rounded-full bg-gray-100 flex items-center justify-center">
                      <Upload className="h-10 w-10 text-gray-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-2">
                        选择一张图片作为{subject}
                      </p>
                      <p className="text-xs text-gray-400">
                        支持 JPG、PNG 格式，超过 {formatBytes(maxBytes)}{" "}
                        会自动压缩
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressing}
                    className="bg-orange-500 hover:bg-orange-600"
                  >
                    {isCompressing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {isCompressing ? "压缩中…" : "选择本地图片"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
