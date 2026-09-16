"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMembers } from "@/context/members-context";
import { toast } from "sonner";

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddMemberDialog({ open, onOpenChange }: AddMemberDialogProps) {
  const { addMember } = useMembers();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!email.trim() || !displayName.trim()) {
      toast.error("请填写邮箱和姓名");
      return;
    }

    // 简单邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("请输入有效的邮箱地址");
      return;
    }

    setSaving(true);
    try {
      const result = await addMember({
        email: email.trim(),
        displayName: displayName.trim(),
        avatar: avatar.trim() || null,
      });

      if (result) {
        toast.success(`已添加成员：${displayName}`);
        // 重置表单
        setEmail("");
        setDisplayName("");
        setAvatar("");
        onOpenChange(false);
      } else {
        toast.error("添加失败，请重试");
      }
    } catch (err) {
      console.error("添加成员失败:", err);
      toast.error("添加失败，该邮箱可能已存在");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加伙伴</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="member-email">邮箱 *</Label>
            <Input
              id="member-email"
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-name">姓名 *</Label>
            <Input
              id="member-name"
              type="text"
              placeholder="张三"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-avatar">头像 URL（可选）</Label>
            <Input
              id="member-avatar"
              type="url"
              placeholder="https://..."
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "添加中..." : "添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
