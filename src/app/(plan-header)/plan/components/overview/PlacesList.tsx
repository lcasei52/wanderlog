"use client";

import { useState } from "react";
import type { PlaceList, PlaceItemInput } from "@/types/place";
import { usePlaces } from "@/context/places-context";
import { useHistory } from "@/context/history-context";
import { buildGroupKey } from "@/lib/place-groups";
import { canDeletePlace, canDragPlace } from "@/lib/place-kinds";
import ListShell from "./ListShell";
import PlaceCard from "../PlaceCard";
import { PlaceListGap } from "../PlaceGap";
import SortableCardGroup from "@/components/SortableCardGroup";
import PlaceSearchInput from "@/components/PlaceSearchInput";
import type { PlaceSearchResult } from "@/hooks/usePlaceSearch";

/**
 * 概览区的一个"地点列表"（Places to visit / 用户自建列表）。
 * 内容 = listItems(listId) 的 PlaceCard 列表 + 搜索添加；标题可改名、列表可删除。
 */
export default function PlacesList({ list }: { list: PlaceList }) {
  const {
    listItems,
    addItem,
    deleteItem,
    renamePlaceList,
    deletePlaceList,
    reorderItems,
  } = usePlaces();
  const { batch } = useHistory();
  const [expanded, setExpanded] = useState(true);

  const items = listItems(list.id);

  const toInput = (result: PlaceSearchResult): PlaceItemInput => ({
    groupKey: buildGroupKey(result),
    name: result.name,
    address: result.address ?? null,
    tel: result.tel ?? null,
    type: result.type ?? null,
    photo: result.photo ?? null,
    lng: result.location?.lng ?? null,
    lat: result.location?.lat ?? null,
  });

  const container = { kind: "list", listId: list.id } as const;

  /** 列表尾部的添加：追加到末尾 */
  const handleSelect = (result: PlaceSearchResult) => {
    addItem(toInput(result), container);
  };

  /**
   * 卡片间隔里的添加：先按常规追加（新行 position = max+1），
   * 再把整段顺序重写成"原顺序 + 新实例插在第 index 位"——
   * reorderItems 会把该容器内的 position 重排为 0..n-1，正好落在这个间隔里。
   *
   * 这两步在用户眼里是**一个**动作（"在这儿插一个地点"），所以包进 batch：
   * 否则撤销栈会记两份快照，按一下只退回重排前、得按两下才把地点收走。
   */
  const handleGapAdd = async (index: number, result: PlaceSearchResult) => {
    await batch(async () => {
      const row = await addItem(toInput(result), container);
      if (!row) return;
      const ids = items.map((it) => it.id);
      await reorderItems([...ids.slice(0, index), row.id, ...ids.slice(index)]);
    });
  };

  return (
    <ListShell
      anchorId={`list-${list.id}`}
      title={list.title}
      onRename={(next) => renamePlaceList(list.id, next)}
      onDelete={() => deletePlaceList(list.id)}
      countLabel={items.length > 0 ? `${items.length} 个地点` : undefined}
      expanded={expanded}
      onExpandedChange={setExpanded}
    >
      <div className="space-y-2">
        {/* 拖动排序只在本列表内生效（position 按列表容器重写） */}
        <SortableCardGroup
          ids={items.map((item) => item.id)}
          onReorder={reorderItems}
          onDelete={deleteItem}
          deleteTitle="从列表中移除"
          // 酒店实例可能被「属于哪些图层」复制进列表，同样不给拖动柄
          canDrag={(id) => {
            const it = items.find((p) => p.id === id);
            return it ? canDragPlace(it) : false;
          }}
          // 同上：复制进来的酒店行也不给垃圾桶
          canDelete={(id) => {
            const it = items.find((p) => p.id === id);
            return it ? canDeletePlace(it) : false;
          }}
          // 卡与卡之间：hover 浮出虚线 + 左端 +，可就地在该位置添加地点
          renderGap={(_, index, dragging) => (
            <PlaceListGap
              dragging={dragging}
              onPlaceSelect={(place) => handleGapAdd(index, place)}
            />
          )}
          renderItem={(id) => {
            const item = items.find((it) => it.id === id);
            return item ? <PlaceCard item={item} /> : null;
          }}
        />
        <PlaceSearchInput
          placeholder="搜索并添加地点"
          onPlaceSelect={handleSelect}
        />
      </div>
    </ListShell>
  );
}
