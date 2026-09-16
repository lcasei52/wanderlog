import type {
  TripMember as SchemaMember,
  NewTripMember as SchemaNewMember,
} from "@/db/schema";

export type TripMember = SchemaMember;
export type NewTripMember = SchemaNewMember;

/** 创建成员时的输入（不含 tripId/position/createdAt） */
export interface MemberInput {
  email: string;
  displayName: string;
  avatar?: string | null;
}

/** 更新成员时的补丁（可选字段） */
export interface MemberPatch {
  displayName?: string;
  avatar?: string | null;
  position?: number;
}
