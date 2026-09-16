"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMembers } from "@/context/members-context";
import { useExpenses } from "@/context/expenses-context";

interface TeamBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TeamBalanceDialog({ open, onOpenChange }: TeamBalanceDialogProps) {
  const { members } = useMembers();
  const { calculateBalances, calculateDebts } = useExpenses();

  const balances = useMemo(() => calculateBalances(members), [calculateBalances, members]);
  const debts = useMemo(() => calculateDebts(balances), [calculateDebts, balances]);

  /*
   * 当前用户 = members[0]，也就是「我」。
   * 项目没有鉴权，这一行身份靠约定：ensureTripSelfMember（db/trip-members.ts）
   * 保证每个行程都有一行 position 0 的「我」，页面查询也按 position 排序。
   */
  const currentUserId = members[0]?.id;
  const currentUserDebts = debts.filter(
    (d) => d.fromId === currentUserId || d.toId === currentUserId
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>团队情况</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="my-summary" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="my-summary">您的摘要</TabsTrigger>
            <TabsTrigger value="team-summary">团队摘要</TabsTrigger>
          </TabsList>

          {/* 您的摘要 */}
          <TabsContent value="my-summary" className="space-y-3 mt-4">
            {currentUserDebts.length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无欠款记录</p>
            ) : (
              currentUserDebts.map((debt, index) => {
                const isOwedToMe = debt.toId === currentUserId;
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      {isOwedToMe ? (
                        <p className="text-sm">
                          <span className="font-medium">{debt.fromName}</span> 欠您款
                        </p>
                      ) : (
                        <p className="text-sm">
                          您欠 <span className="font-medium">{debt.toName}</span> 款
                        </p>
                      )}
                    </div>
                    <p
                      className={`text-lg font-semibold ${
                        isOwedToMe ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {isOwedToMe ? "+" : "-"}¥{debt.amount.toFixed(2)}
                    </p>
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* 团队摘要 */}
          <TabsContent value="team-summary" className="space-y-3 mt-4">
            {balances.length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无成员</p>
            ) : (
              balances.map((balance) => (
                <div
                  key={balance.memberId}
                  className="p-3 bg-gray-50 rounded-lg space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{balance.memberName}</p>
                    <p
                      className={`text-lg font-semibold ${
                        balance.balance > 0
                          ? "text-green-600"
                          : balance.balance < 0
                          ? "text-red-600"
                          : "text-gray-600"
                      }`}
                    >
                      {balance.balance > 0 ? "+" : ""}¥{balance.balance.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500 flex gap-4">
                    <span>已支付 ¥{balance.totalPaid.toFixed(2)}</span>
                    <span>应承担 ¥{balance.totalOwed.toFixed(2)}</span>
                  </div>

                  {/* 展开显示具体欠款关系 */}
                  {Math.abs(balance.balance) > 0.01 && (
                    <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                      {debts
                        .filter((d) => d.fromId === balance.memberId || d.toId === balance.memberId)
                        .map((debt, idx) => (
                          <p key={idx} className="text-xs text-gray-600">
                            {debt.fromId === balance.memberId
                              ? `→ 欠 ${debt.toName} ¥${debt.amount.toFixed(2)}`
                              : `← ${debt.fromName} 欠 ¥${debt.amount.toFixed(2)}`}
                          </p>
                        ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
