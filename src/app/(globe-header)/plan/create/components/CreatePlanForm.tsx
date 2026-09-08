"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Globe, Users, Lock } from "lucide-react";
import { Form } from "@/components/ui/form";
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

// 表单验证规则
const formSchema = z.object({
  destination: z.string().min(1, "选择一个目的地开始计划"),
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

  const form = useForm<FormValues>({
    mode: "onBlur",
    resolver: zodResolver(formSchema),
    defaultValues: {
      destination: "",
      inviteEmail: "",
      privacy: "private",
    },
  });

  const onSubmit = (data: FormValues) => {
    console.log("表单数据:", data);
    // TODO: 处理创建行程逻辑
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* 目的地输入 */}
        <InputWithLabel
          fieldTitle="去哪儿？"
          inputName="destination"
          placeholder="例如：纽约、巴黎、日本"
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
          className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-full"
        >
          开始规划
        </Button>
      </form>
    </Form>
  );
}
