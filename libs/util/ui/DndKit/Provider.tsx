"use client";

import type { DndContextProps } from "@dnd-kit/core";
import { closestCorners, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { createContext, useRef } from "react";

export type ProviderProps = DndContextProps & {
  className?: string;
};
export type DndContextItemType<T> = T extends (infer U)[] ? U : never;

export interface DndContextType {
  [key: string]: {
    id: string;
    items: any[];
  };
}

export const ItemsContext = createContext<DndContextType>({});

export const Provider = ({ children, className, ...props }: ProviderProps) => {
  const itemsMap = useRef<DndContextType>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <ItemsContext.Provider value={itemsMap.current}>
      <DndContext {...props} autoScroll={{ enabled: false }} sensors={sensors} collisionDetection={closestCorners}>
        <div className={className}>{children}</div>
      </DndContext>
    </ItemsContext.Provider>
  );
};
