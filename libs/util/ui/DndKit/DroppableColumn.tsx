"use client";

import { DragEndEvent, DragOverEvent, useDndMonitor, useDroppable } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { clsx } from "clsx";
import { ReactNode, useContext, useEffect, useState } from "react";

import { DragEmpty } from "./DragEmpty";
import { ItemsContext } from "./Provider";
import { isMyColumn, mergeOverItems } from "./util";

interface ItemsContextType<
  T extends {
    id: string;
  }[],
> {
  [key: string]: {
    id: string;
    items: T;
  };
}

interface DroppableColumnProps<
  T extends {
    id: string;
  }[],
> {
  id: string;
  items: T;
  className?: string;
  children: ReactNode;
  onOver?: (id: string, items: T, event: DragOverEvent) => void;
  onEnd?: (id: string, item: T[number], event: DragEndEvent) => void;
}

export function DroppableColumn<T extends { id: string }[]>({
  id,
  items,
  className,
  onOver,
  onEnd,
  children,
}: DroppableColumnProps<T>) {
  const { setNodeRef, node } = useDroppable({ id });
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const itemsMap = useContext(ItemsContext) as unknown as ItemsContextType<T>;
  const findItemId = (findId: string) => {
    let itemKey = "unknown";
    if (findId.includes("-empty")) {
      Object.keys(itemsMap).forEach((key) => {
        const emptyItem = findId.split("-")[0];
        if (key === emptyItem) {
          itemKey = key;
        }
      });
      return itemKey;
    }
    Object.keys(itemsMap).forEach((key) => {
      if (key === findId) itemKey = key;
      if (itemsMap[key].items.find((i) => i.id === findId)) {
        itemKey = key;
      }
    });

    return itemKey;
  };

  const findItem = (id: string) => {
    const itemKey = findItemId(id);
    return itemsMap[itemKey].items.find((i) => i.id === id);
  };

  useDndMonitor({
    onDragOver(event) {
      setTimeout(() => {
        setIsDragging(true);
      }, 100);
      if (!isDragging) return;
      const { active, over, delta } = event;

      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      const activeItemId = findItemId(activeId);
      const overItemId = findItemId(overId);
      if (activeItemId === "unknown" || overItemId === "unknown") return;
      const activeItems = itemsMap[activeItemId].items;
      const overItems = itemsMap[overItemId].items;
      const activeIndex = activeItems.findIndex((i) => i.id === activeId);
      const overIndex = overItems.findIndex((i) => i.id === overId);
      if (activeItemId === overItemId && activeItemId === id) {
        // const newOverItems = arrayMove(overItems, activeIndex, overIndex) as T;
        // console.log(newOverItems);
        // return;
        // setTimeout(() => {
        // onOver?.(id, newOverItems, event);
        return;
        // }, 0);
      } else if (activeItemId !== overItemId) {
        if (overItemId === id) {
          setIsOver(true);
          const newOverItems = mergeOverItems<T>({
            activeId,
            overId,
            activeItems,
            overItems,
            delta,
          });
          setTimeout(() => {
            onOver?.(id, newOverItems, event);
          }, 0);
          return;
        } else if (activeItemId === id) {
          setIsOver(false);
          setTimeout(() => {
            onOver?.(id, activeItems.filter((i) => i.id !== activeId) as T, event);
          }, 0);
          return;
        }
      }
    },

    onDragEnd(event) {
      setIsDragging(false);
      if (!isDragging) return;
      const { active, over } = event;
      const activeId = String(active.id);
      const overId = String(over?.id);
      const activeItemId = findItemId(activeId);
      const overItemId = findItemId(overId);
      if (
        over &&
        isMyColumn(
          overId,
          items.map((i) => i.id)
        )
      ) {
        const activeItems = itemsMap[activeItemId].items;
        const overItems = itemsMap[overItemId].items;

        const activeIndex = activeItems.findIndex((i) => i.id === activeId);
        const overIndex = overItems.findIndex((i) => i.id === overId);
        const activeItem = findItem(activeId);
        if (!activeItem) return;
        const newOverItems = arrayMove(overItems, activeIndex, overIndex);
        setTimeout(() => {
          onEnd?.(id, activeItem, event);
        }, 0);
      }
      setIsOver(false);
    },
  });

  useEffect(() => {
    itemsMap[id] = {
      id,
      items,
    };
  }, [items]);
  return (
    <SortableContext id={id} items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
      <div
        ref={setNodeRef}
        className={clsx(
          "border-base-content relative h-full rounded-md border-[0.5px] p-2",
          {
            "bg-primary/10 border-primary border duration-300": isOver,
          },
          className
        )}
      >
        {children}
        {items.length ? <></> : <DragEmpty columnId={id} />}
      </div>
    </SortableContext>
  );
}
