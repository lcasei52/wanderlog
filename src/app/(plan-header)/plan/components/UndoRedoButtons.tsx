"use client";

import { RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UndoRedoButtons() {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
        disabled
      >
        <RotateCcw className="h-4 w-4" />
        <span>撤销</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
        disabled
      >
        <RotateCw className="h-4 w-4" />
        <span>重做</span>
      </Button>
    </div>
  );
}
