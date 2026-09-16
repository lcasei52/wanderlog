"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import type { TripMember } from "@/types/member";

/** 没头像时的首字：中文取第一个字，英文取首字母大写 */
function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const first = trimmed[0];
  return /[一-龥]/.test(first) ? first : first.toUpperCase();
}

interface MemberAvatarProps {
  /** 允许 undefined：费用上的 id 万一查不到成员（老数据/被删），显示占位而不是崩掉 */
  member?: TripMember;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export default function MemberAvatar({
  member,
  size = "sm",
  className,
}: MemberAvatarProps) {
  return (
    <Avatar size={size} className={className} title={member?.displayName}>
      {member?.avatar && (
        <AvatarImage src={member.avatar} alt={member.displayName} />
      )}
      <AvatarFallback>
        {member ? initialOf(member.displayName) : "?"}
      </AvatarFallback>
    </Avatar>
  );
}

interface MemberAvatarStackProps {
  members: TripMember[];
  /** 最多显示几个，多出来的折成 +N */
  max?: number;
  size?: "sm" | "default" | "lg";
}

/** 费用卡右下角那一摞头像：谁参与分摊就显示谁 */
export function MemberAvatarStack({
  members,
  max = 4,
  size = "sm",
}: MemberAvatarStackProps) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;

  return (
    <AvatarGroup>
      {shown.map((member) => (
        <MemberAvatar key={member.id} member={member} size={size} />
      ))}
      {rest > 0 && <AvatarGroupCount>+{rest}</AvatarGroupCount>}
    </AvatarGroup>
  );
}
