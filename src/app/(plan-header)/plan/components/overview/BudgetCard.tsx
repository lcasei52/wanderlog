"use client";

import { Button } from "@/components/ui/button";

export default function BudgetCard() {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">预算</h3>
      <div>
        <p className="text-2xl font-semibold text-gray-900">HK$0.00</p>
        <Button variant="link" className="text-sm text-blue-600 hover:text-blue-700 p-0 h-auto mt-2">
          查看详情
        </Button>
      </div>
    </div>
  );
}
