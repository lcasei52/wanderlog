"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TripMember } from "@/types/member";
import {
  createMember,
  deleteMemberById,
  reorderMembers as reorderMembersAction,
  updateMemberById,
  type MemberPatch,
} from "@/actions/members";

interface MembersContextValue {
  tripId: string;
  members: TripMember[];
  addMember: (
    data: Omit<TripMember, "id" | "tripId" | "position" | "createdAt">
  ) => Promise<TripMember | null>;
  updateMember: (id: string, patch: MemberPatch) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  reorderMembers: (orderedIds: string[]) => Promise<void>;
  getMember: (id: string) => TripMember | undefined;
}

const MembersContext = createContext<MembersContextValue | null>(null);

export function MembersProvider({
  tripId,
  members: seedMembers,
  children,
}: {
  tripId: string;
  members: TripMember[];
  children: ReactNode;
}) {
  const [members, setMembers] = useState<TripMember[]>(seedMembers);

  const addMember = useCallback(
    async (data: Omit<TripMember, "id" | "tripId" | "position" | "createdAt">) => {
      try {
        const row = await createMember(tripId, data);
        setMembers((prev) => [...prev, row]);
        return row;
      } catch (err) {
        console.error("添加成员失败:", err);
        return null;
      }
    },
    [tripId]
  );

  const updateMember = useCallback(async (id: string, patch: MemberPatch) => {
    try {
      const row = await updateMemberById(id, patch);
      if (row) {
        setMembers((prev) => prev.map((m) => (m.id === id ? row : m)));
      }
    } catch (err) {
      console.error("更新成员失败:", err);
    }
  }, []);

  const deleteMember = useCallback(async (id: string) => {
    try {
      await deleteMemberById(id);
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("删除成员失败:", err);
    }
  }, []);

  const reorderMembers = useCallback(
    async (orderedIds: string[]) => {
      const order = new Map(orderedIds.map((id, i) => [id, i]));
      setMembers((prev) =>
        prev.map((m) => (order.has(m.id) ? { ...m, position: order.get(m.id)! } : m))
      );
      try {
        await reorderMembersAction(tripId, orderedIds);
      } catch (err) {
        console.error("成员排序失败:", err);
      }
    },
    [tripId]
  );

  const getMember = useCallback(
    (id: string) => members.find((m) => m.id === id),
    [members]
  );

  const value = useMemo<MembersContextValue>(
    () => ({
      tripId,
      members,
      addMember,
      updateMember,
      deleteMember,
      reorderMembers,
      getMember,
    }),
    [tripId, members, addMember, updateMember, deleteMember, reorderMembers, getMember]
  );

  return <MembersContext.Provider value={value}>{children}</MembersContext.Provider>;
}

export function useMembers(): MembersContextValue {
  const ctx = useContext(MembersContext);
  if (!ctx) {
    throw new Error("useMembers 必须在 <MembersProvider> 内使用");
  }
  return ctx;
}
