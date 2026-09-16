"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Expense, BalanceSummary, DebtRelation } from "@/types/expense";
import type { TripMember } from "@/types/member";
import { useHistory, useRegisterSnapshot } from "@/context/history-context";
import {
  createExpense,
  deleteExpenseById,
  reorderExpenses as reorderExpensesAction,
  updateExpenseById,
  type ExpensePatch,
} from "@/actions/expenses";

interface ExpensesContextValue {
  tripId: string;
  expenses: Expense[];
  totalSpent: number;
  addExpense: (
    data: Omit<Expense, "id" | "tripId" | "position" | "createdAt">
  ) => Promise<Expense | null>;
  updateExpense: (id: string, patch: ExpensePatch) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  /**
   * 删掉挂在某个航班/住宿上的费用（服务端已随父记录一起删了，这里同步本地态）。
   * 不调用的话，删除航班后预算里那条费用会一直挂到下次刷新才消失。
   */
  removeExpensesByLinkedItem: (
    linkedItemType: string,
    linkedItemId: string
  ) => void;
  reorderExpenses: (orderedIds: string[]) => Promise<void>;
  getExpense: (id: string) => Expense | undefined;
  /** 计算团队结算（每人支付/应分摊/净余额） */
  calculateBalances: (members: TripMember[]) => BalanceSummary[];
  /** 计算简化后的欠款关系（最少转账次数）。余额里已经带了 memberName，不必再传 members */
  calculateDebts: (balances: BalanceSummary[]) => DebtRelation[];
}

const ExpensesContext = createContext<ExpensesContextValue | null>(null);

export function ExpensesProvider({
  tripId,
  expenses: seedExpenses,
  children,
}: {
  tripId: string;
  expenses: Expense[];
  children: ReactNode;
}) {
  const [expenses, setExpenses] = useState<Expense[]>(seedExpenses);
  const { push } = useHistory();

  /*
   * 撤销栈在所有 provider 外面（见 history-context），这里把自己这一片登记进去。
   * 每个改了费用的动作在动手**之前**调一次 push()，别的什么都不用管 ——
   * 以前那个"把 nonce +1 让外层 effect 替我们记"的传话机制已经拆掉了。
   */
  useRegisterSnapshot("expenses", () => expenses, setExpenses);

  const totalSpent = useMemo(
    () => expenses.reduce((sum, exp) => sum + exp.amount, 0),
    [expenses]
  );

  const addExpense = useCallback(
    async (data: Omit<Expense, "id" | "tripId" | "position" | "createdAt">) => {
      push();
      try {
        const row = await createExpense(tripId, data);
        setExpenses((prev) => [...prev, row]);
        return row;
      } catch (err) {
        console.error("添加费用失败:", err);
        return null;
      }
    },
    [tripId, push]
  );

  const updateExpense = useCallback(
    async (id: string, patch: ExpensePatch) => {
      push();
      try {
        const row = await updateExpenseById(id, patch);
        if (row) {
          setExpenses((prev) => prev.map((e) => (e.id === id ? row : e)));
        }
      } catch (err) {
        console.error("更新费用失败:", err);
      }
    },
    [push]
  );

  const deleteExpense = useCallback(
    async (id: string) => {
      push();
      try {
        await deleteExpenseById(id);
        setExpenses((prev) => prev.filter((e) => e.id !== id));
      } catch (err) {
        console.error("删除费用失败:", err);
      }
    },
    [push]
  );

  /**
   * 故意**不**调 push()：这是跟着删地点/删航班走的附带清理，那一次操作的快照已经
   * 由发起方记过（而且多半是在 batch() 里），这里再记一次就得按两下撤销才退得回去。
   */
  const removeExpensesByLinkedItem = useCallback(
    (linkedItemType: string, linkedItemId: string) => {
      setExpenses((prev) =>
        prev.filter(
          (e) =>
            !(
              e.linkedItemType === linkedItemType &&
              e.linkedItemId === linkedItemId
            )
        )
      );
    },
    []
  );

  /*
   * 拖拽排序也进撤销栈。注意顺序：先 push（拿的是上一次提交渲染的顺序），再乐观
   * 更新本地，最后才落库 —— 反过来先 setExpenses 再 push 的话，记下来的是"改之后"
   * 的那一份，撤销等于没退。（UI 目前还没接这个动作。）
   */
  const reorderExpenses = useCallback(
    async (orderedIds: string[]) => {
      push();
      const order = new Map(orderedIds.map((id, i) => [id, i]));
      setExpenses((prev) =>
        prev.map((e) => (order.has(e.id) ? { ...e, position: order.get(e.id)! } : e))
      );
      try {
        await reorderExpensesAction(tripId, orderedIds);
      } catch (err) {
        console.error("费用排序失败:", err);
      }
    },
    [tripId, push]
  );

  const getExpense = useCallback(
    (id: string) => expenses.find((e) => e.id === id),
    [expenses]
  );

  const calculateBalances = useCallback(
    (members: TripMember[]): BalanceSummary[] => {
      const balances = members.map((member) => ({
        memberId: member.id,
        memberName: member.displayName,
        totalPaid: 0,
        totalOwed: 0,
        balance: 0,
      }));

      const balanceMap = new Map(balances.map((b) => [b.memberId, b]));

      expenses.forEach((exp) => {
        const payer = balanceMap.get(exp.paidBy);
        if (payer) {
          payer.totalPaid += exp.amount;
        }

        if (exp.splitWith.length > 0) {
          const perPerson = exp.amount / exp.splitWith.length;
          exp.splitWith.forEach((memberId) => {
            const member = balanceMap.get(memberId);
            if (member) {
              member.totalOwed += perPerson;
            }
          });
        } else {
          // 不分摊 = 只有付款人承担
          if (payer) {
            payer.totalOwed += exp.amount;
          }
        }
      });

      balances.forEach((b) => {
        b.balance = b.totalPaid - b.totalOwed;
      });

      return balances;
    },
    [expenses]
  );

  const calculateDebts = useCallback(
    (balances: BalanceSummary[]): DebtRelation[] => {
      const debtors = balances.filter((b) => b.balance < 0).map((b) => ({ ...b }));
      const creditors = balances.filter((b) => b.balance > 0).map((b) => ({ ...b }));
      const debts: DebtRelation[] = [];

      let i = 0;
      let j = 0;
      while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i];
        const creditor = creditors[j];
        const amount = Math.min(-debtor.balance, creditor.balance);

        if (amount > 0.01) {
          debts.push({
            fromId: debtor.memberId,
            fromName: debtor.memberName,
            toId: creditor.memberId,
            toName: creditor.memberName,
            amount: parseFloat(amount.toFixed(2)),
          });
        }

        debtor.balance += amount;
        creditor.balance -= amount;

        if (Math.abs(debtor.balance) < 0.01) i++;
        if (Math.abs(creditor.balance) < 0.01) j++;
      }

      return debts;
    },
    []
  );

  const value = useMemo<ExpensesContextValue>(
    () => ({
      tripId,
      expenses,
      totalSpent,
      addExpense,
      updateExpense,
      deleteExpense,
      removeExpensesByLinkedItem,
      reorderExpenses,
      getExpense,
      calculateBalances,
      calculateDebts,
    }),
    [
      tripId,
      expenses,
      totalSpent,
      addExpense,
      updateExpense,
      deleteExpense,
      removeExpensesByLinkedItem,
      reorderExpenses,
      getExpense,
      calculateBalances,
      calculateDebts,
    ]
  );

  return <ExpensesContext.Provider value={value}>{children}</ExpensesContext.Provider>;
}

export function useExpenses(): ExpensesContextValue {
  const ctx = useContext(ExpensesContext);
  if (!ctx) {
    throw new Error("useExpenses 必须在 <ExpensesProvider> 内使用");
  }
  return ctx;
}
