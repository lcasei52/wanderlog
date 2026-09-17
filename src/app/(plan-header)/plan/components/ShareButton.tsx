"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ShareButton() {
  const handleShare = () => {
    console.log("分享功能");
  };

  return (
    <Button
      onClick={handleShare}
      className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-4"
    >
      <Share2 className="h-4 w-4 mr-2" />
      <span className="font-black">分享</span>
    </Button>
  );
}
