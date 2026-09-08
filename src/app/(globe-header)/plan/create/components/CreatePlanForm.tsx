"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Globe, Users, Lock } from "lucide-react";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DateRangeSelect from "./DateRangeSelect";
import InputWithLabel from "./InputWithLabel";
import DestinationSearchInput, { DestinationResult } from "@/components/DestinationSearchInput";
import { createTrip } from "@/actions/trips";

// 表单验证规则
const formSchema = z.object({
  destination: z.string().min(1, "选择一个目的地开始计划"),
  destinationData: z.object({
    name: z.string(),
    location: z.object({
      lng: z.number(),
      lat: z.number(),
    }),
    type: z.enum(["city", "province", "country"]),
  }).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  inviteEmail: z
    .string()
    .email("请输入有效的邮箱地址")
    .optional()
    .or(z.literal("")),
  privacy: z.enum(["public", "friends", "private"]),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreatePlanForm() {
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const form = useForm<FormValues>({
    mode: "onBlur",
    resolver: zodResolver(formSchema),
    defaultValues: {
      destination: "",
      inviteEmail: "",
      privacy: "private",
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      // 根据目的地生成行程名，如"前往武汉的旅行"
      const destName = data.destinationData?.name ?? data.destination;
      const name = destName ? `前往${destName}的旅行` : "新的旅行";

      const { id } = await createTrip({
        name,
        destination: data.destinationData ?? null,
        startDate: data.startDate ? format(data.startDate, "yyyy-MM-dd") : null,
        endDate: data.endDate ? format(data.endDate, "yyyy-MM-dd") : null,
        privacy: data.privacy,
        inviteEmail: data.inviteEmail ?? "",
      });

      // 创建成功 → 跳到该行程的详情页
      router.push(`/plan/${id}`);
    } catch (err) {
      console.error("创建行程失败:", err);
      alert("创建行程失败，请稍后重试");
      setIsSubmitting(false);
    }
  };

  // 处理目的地选择
  const handleDestinationSelect = (destination: DestinationResult) => {
    form.setValue("destination", destination.name);
    form.setValue("destinationData", {
      name: destination.name,
      location: destination.location,
      type: destination.type,
    });
    // 清除验证错误
    form.clearErrors("destination");
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* 目的地输入 */}
        <FormField
          control={form.control}
          name="destination"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium">去哪儿？</FormLabel>
              <FormControl>
                <DestinationSearchInput
                  value={field.value}
                  onChange={handleDestinationSelect}
                  placeholder="例如：武汉、湖北、北京"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 日期选择 */}
        <DateRangeSelect />

        {/* 邀请旅伴输入框（可展开） */}
        {showInviteInput && (
          <div className="animate-in slide-in-from-top duration-200">
            <InputWithLabel
              fieldTitle="邀请旅伴"
              inputName="inviteEmail"
              placeholder="输入旅伴的邮箱地址"
            />
          </div>
        )}

        {/* 邀请旅伴按钮 & 隐私设置 */}
        <div className="flex items-center justify-between text-sm">
          {/* 左侧：邀请旅伴按钮 */}
          <button
            type="button"
            onClick={() => setShowInviteInput(!showInviteInput)}
            className="flex items-center gap-1 text-gray-600 hover:text-orange-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>邀请旅伴</span>
          </button>

          {/* 右侧：隐私设置 */}
          <div className="flex items-center gap-2">
            <span className="text-gray-600">隐私:</span>
            <Select
              value={form.watch("privacy")}
              onValueChange={(value: "public" | "friends" | "private") =>
                form.setValue("privacy", value)
              }
            >
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <span>公开</span>
                  </div>
                </SelectItem>
                <SelectItem value="friends">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>朋友</span>
                  </div>
                </SelectItem>
                <SelectItem value="private">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    <span>私人</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 提交按钮 */}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-full disabled:opacity-60"
        >
          {isSubmitting ? "创建中..." : "开始规划"}
        </Button>
      </form>
    </Form>
  );
}
