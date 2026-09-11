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
  /** 行程目的地名，用于搜索相关图片（如"武汉"） */
  destinationName?: string;
}

export default function ImagePickerDialog({
  open,
  onOpenChange,
  onSelect,
  destinationName,
}: ImagePickerDialogProps) {
  // 网络图片 tab 状态
  const [images, setImages] = useState<UnsplashImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // 本地上传 tab 状态
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 弹窗打开时自动加载图片
  useEffect(() => {
    if (open && !hasLoaded) {
      fetchImages();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 首次打开 network tab 时加载图片（基于 destination 或默认 travel）
  const handleTabChange = async (value: string) => {
    if (value === "network" && !hasLoaded) {
      await fetchImages();
    }
  };

  // 搜索网络图片（固定 9 张，基于 destination 或默认 travel）
  const fetchImages = async () => {
    setIsLoading(true);
    const query = destinationName || "travel";
    try {
      const response = await fetch(
        `/api/unsplash/search?q=${encodeURIComponent(query)}`
      );
      if (!response.ok) throw new Error("Failed to fetch images");
      const data = await response.json();
      setImages((data.images || []).slice(0, 9)); // 只取前 9 张
      setHasLoaded(true);
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
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件大小（2MB 限制）
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      toast.error("图片过大，请选择小于 2MB 的文件");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // 读取文件转 base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setLocalPreview(dataUrl);
    };
    reader.onerror = () => {
      toast.error("读取文件失败");
    };
    reader.readAsDataURL(file);
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
          <DialogTitle>选择封面图片</DialogTitle>
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
                    {destinationName
                      ? `暂无「${destinationName}」相关图片`
                      : "暂无图片"}
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
                        选择一张图片作为行程封面
                      </p>
                      <p className="text-xs text-gray-400">
                        支持 JPG、PNG 格式，文件大小不超过 2MB
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-orange-500 hover:bg-orange-600"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    选择本地图片
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
