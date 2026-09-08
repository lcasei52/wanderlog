"use client";

import { useState } from "react";
import { MapPin, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PlaceSearchInput from "@/components/PlaceSearchInput";
import { PlaceSearchResult } from "@/hooks/usePlaceSearch";

export interface Place {
  id: string;
  name: string;
  address?: string;
  location?: {
    lng: number;
    lat: number;
  };
}

interface DayCardProps {
  dayNumber: number;
  date: string;
  places?: Place[];
  onAddPlace?: (dayNumber: number, place: Place) => void;
  onDeletePlace?: (dayNumber: number, placeId: string) => void;
}

export default function DayCard({
  dayNumber,
  date,
  places = [],
  onAddPlace,
  onDeletePlace,
}: DayCardProps) {
  const [isAddingPlace, setIsAddingPlace] = useState(false);

  // 处理地点选择
  const handlePlaceSelect = (placeResult: PlaceSearchResult) => {
    if (onAddPlace) {
      const place: Place = {
        id: placeResult.id,
        name: placeResult.name,
        address: placeResult.address,
        location: placeResult.location,
      };
      onAddPlace(dayNumber, place);
      setIsAddingPlace(false);
    }
  };

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-lg">Day {dayNumber}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>复制当日</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600 focus:text-red-600">
              删除当日
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-sm text-gray-500 mb-4">{date}</p>

      {/* 已添加的地点列表 */}
      {places.length > 0 && (
        <div className="space-y-2 mb-4">
          {places.map((place) => (
            <div
              key={place.id}
              className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 group"
            >
              <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <span className="flex-1 text-sm text-gray-700">{place.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onDeletePlace?.(dayNumber, place.id)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 添加地点输入框或按钮 */}
      {isAddingPlace ? (
        <PlaceSearchInput
          placeholder="搜索并添加地点"
          onPlaceSelect={handlePlaceSelect}
          onCancel={() => setIsAddingPlace(false)}
        />
      ) : (
        <Button
          variant="link"
          className="text-sm text-gray-400 hover:text-gray-600 p-0 h-auto"
          onClick={() => setIsAddingPlace(true)}
        >
          {places.length === 0 ? "还没有添加地点" : "+ 添加地点"}
        </Button>
      )}
    </div>
  );
}
